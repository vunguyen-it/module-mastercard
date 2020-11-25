/*
 * Copyright (c) 2016-2019 Mastercard
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/*global define*/
define(
    [
        'jquery',
        'Magento_Checkout/js/view/payment/default',
        'Magento_Checkout/js/model/payment/additional-validators',
        'mage/translate',
        'Magento_Checkout/js/action/set-payment-information',
        'uiLayout',
        'Magento_Checkout/js/model/full-screen-loader',
        'Magento_Vault/js/view/payment/vault-enabler',
        'Magento_Ui/js/modal/modal'
    ],
    function (
        $,
        ccFormComponent,
        additionalValidators,
        $t,
        setPaymentInformationAction,
        layout,
        fullScreenLoader,
        VaultEnabler,
        modal
    ) {
        'use strict';

        return ccFormComponent.extend({
            defaults: {
                template: 'OnTap_MasterCard/payment/tns-hpf',
                active: false,
                adapterLoaded: false,
                buttonTitle: null,
                buttonTitleEnabled: $t('Place Order'),
                buttonTitleDisabled: $t('Please wait...'),
                imports: {
                    onActiveChange: 'active'
                },
                creditCardExpYear: '',
                creditCardExpMonth: ''
            },
            placeOrderHandler: null,
            validateHandler: null,
            sessionId: null,

            initialize: function () {
                this._super();
                this.vaultEnabler = VaultEnabler();
                this.vaultEnabler.setPaymentCode(this.getVaultCode());
                this.redirectAfterPlaceOrder = !this.is3Ds2Enabled();

                return this;
            },

            afterPlaceOrder: function () {
                if (!this.is3Ds2Enabled()) {
                    return;
                }

                // TODO move in action (do composition)

                $.post(
                    // TODO use url builder
                    '/tns/threedsecureV2/initiateAuth',
                    {
                        browserDetails: {
                            javaEnabled: navigator.javaEnabled(),
                            language: navigator.language,
                            screenHeight: window.screen.height,
                            screenWidth: window.screen.width,
                            timeZone: new Date().getTimezoneOffset(),
                            colorDepth: screen.colorDepth,
                            acceptHeaders: 'application/json',
                            '3DSecureChallengeWindowSize': 'FULL_SCREEN'
                        }
                    }
                ).done(function (res) {
                    // TODO open modal if ACS required, do not open if 3DS2 without window
                    window.treeDS2Completed = function () {
                        this.modal.modal('closeModal');
                        setTimeout(function () {
                            this.modal.remove();
                        }.bind(this), 1000)
                    }.bind(this);
                    var div = document.createElement('div');
                    $('body').append(div);


                    this.modal = $(div);

                    // TODO move modal logic in separate UI or module
                    modal({
                        type: 'slide',
                        title: $.mage.__('Process Secure Payment'),
                        buttons: [],
                        closed: $.proxy(this.onModalClose, this),
                        clickableOverlay: false
                    }, this.modal);

                    // var div = document.getElementById('three-ds-placeholder')
                    div.innerHTML = res.redirectHtml;
                    eval(document.getElementById('authenticate-payer-script').text);
                    // console.log('initiateAuth', res);

                    this.iframe = $('iframe', this.modal);

                    this.modal.css({
                        height: '100%'
                    });
                    this.modal.parent().css({
                        height: '80%'
                    });

                    this.iframe.css({
                        height: '100%',
                        width: '100%'
                    });

                    this.modal.modal('openModal');
                })
                console.log('3DS2 flow ----START-----');
            },

            onModalClose: function () {
                alert('closed');
            },

            getId: function () {
                return this.index;
            },

            getVaultCode: function () {
                return window.checkoutConfig.payment[this.getCode()].ccVaultCode;
            },

            isVaultEnabled: function () {
                return this.vaultEnabler.isVaultEnabled();
            },

            initObservable: function () {
                this._super()
                    .observe([
                        'active',
                        'adapterLoaded',
                        'creditCardExpYear',
                        'creditCardExpMonth',
                        'buttonTitle'
                    ]);

                this.buttonTitle(this.buttonTitleDisabled);
                this.isPlaceOrderActionAllowed.subscribe(function (allowed) {
                    if (allowed === true && this.isActive()) {
                        this.buttonTitle(this.buttonTitleEnabled);
                    }
                }, this);
                this.adapterLoaded.subscribe($.proxy(function (loaded) {
                    if (loaded === true && this.isActive()) {
                        this.buttonTitle(this.buttonTitleEnabled);
                    }
                }, this));

                return this;
            },

            setValidateHandler: function (handler) {
                this.validateHandler = handler;
            },

            setPlaceOrderHandler: function (handler) {
                this.placeOrderHandler = handler;
            },

            getCvvImageHtml: function() {
                return '<img src="' + this.getCvvImageUrl()
                    + '" alt="' + $t('Card Verification Number Visual Reference')
                    + '" title="' + $t('Card Verification Number Visual Reference')
                    + '" />';
            },

            getCcMonthsValues: function() {
                return _.map(this.getCcMonths(), function(value, key) {
                    return {
                        'value': key,
                        'month': value
                    }
                });
            },

            getCcYearsValues: function() {
                return _.map(this.getCcYears(), function(value, key) {
                    return {
                        'value': key,
                        'year': value
                    }
                });
            },

            getCcMonths: function() {
                return window.checkoutConfig.payment.ccform.months[this.getCode()];
            },

            getCcYears: function() {
                return window.checkoutConfig.payment.ccform.years[this.getCode()];
            },

            getCvvImageUrl: function() {
                return window.checkoutConfig.payment.ccform.cvvImageUrl[this.getCode()];
            },

            hasVerification: function() {
                return window.checkoutConfig.payment.ccform.hasVerification[this.getCode()];
            },

            context: function () {
                return this;
            },

            getCode: function () {
                return 'tns_hpf';
            },

            onActiveChange: function (isActive) {
                if (isActive && !this.adapterLoaded()) {
                    this.loadAdapter();
                }
            },

            isActive: function () {
                var active = this.getCode() === this.isChecked();
                this.active(active);
                return active;
            },

            loadAdapter: function () {
                var config = this.getConfig();
                require([config.component_url], this.paymentAdapterLoaded.bind(this));
            },

            isCheckoutDisabled: function () {
                return !this.adapterLoaded() || !this.isPlaceOrderActionAllowed();
            },

            paymentAdapterLoaded: function () {
                this.isPlaceOrderActionAllowed(false);
                this.buttonTitle(this.buttonTitleDisabled);

                PaymentSession.configure({
                    fields: this.getCardFields(),
                    frameEmbeddingMitigation: ['x-frame-options'],
                    callbacks: {
                        initialized: function () {
                            this.adapterLoaded(true);
                            this.isPlaceOrderActionAllowed(true);
                        }.bind(this),
                        formSessionUpdate: this.formSessionUpdate.bind(this)
                    }
                }, this.getId());
            },

            formSessionUpdate: function (response) {
                var fields = this.getCardFields();
                for (var field in fields.card) {
                    if (!fields.card.hasOwnProperty(field)) {
                        continue;
                    }
                    $(fields.card[field] + '-error').hide();
                }

                if (response.status === "fields_in_error") {
                    if (response.errors) {
                        var errors = this.errorMap();
                        for (var err in response.errors) {
                            if (!response.errors.hasOwnProperty(err)) {
                                continue;
                            }
                            var message = errors[err],
                                elem_id = fields.card[err] + '-error';

                            $(elem_id).text(message).show();
                        }
                        fullScreenLoader.stopLoader();
                    }
                }
                if (response.status === "ok") {
                    this.sessionId = response.session.id;
                    if (this.is3DsEnabled()) {
                        var action = setPaymentInformationAction(this.messageContainer, this.getData());

                        $.when(action).done($.proxy(function() {
                            this.delegate('threeDSecureOpen', this);
                        }, this)).fail(
                            $.proxy(this.threeDSecureCheckFailed, this)
                        );
                    } else {
                        this.isPlaceOrderActionAllowed(true);
                        this.placeOrder();
                    }
                }
            },

            savePayment: function () {
                PaymentSession.updateSessionFromForm('card', undefined, this.getId());
            },

            errorMap: function () {
                return {
                    'cardNumber': $t('Invalid card number'),
                    'securityCode': $t('Invalid security code'),
                    'expiryMonth': $t('Invalid expiry month'),
                    'expiryYear': $t('Invalid expiry year')
                };
            },

            getData: function () {
                var data = {
                    'method': this.item.method,
                    'additional_data': {
                        'session': this.sessionId
                    }
                };
                this.vaultEnabler.visitAdditionalData(data);
                return data;
            },

            getCardFields: function () {
                return {
                    card: {
                        cardNumber: "#tns_hpf_cc_number",
                        number: "#tns_hpf_cc_number",
                        expiryMonth: "#tns_hpf_expiration",
                        expiryYear: "#tns_hpf_expiration_yr",
                        securityCode: "#tns_hpf_cc_cid"
                    }
                }
            },

            getConfig: function () {
                return window.checkoutConfig.payment[this.getCode()];
            },

            is3DsEnabled: function () {
                return this.getConfig()['three_d_secure'] && this.getConfig()['three_d_secure_version'] === 1;
            },

            is3Ds2Enabled: function() {
                return this.getConfig()['three_d_secure'] && this.getConfig()['three_d_secure_version'] === 2;
            },

            initChildren: function () {
                this._super();
                var config = this.getConfig();

                var threeDSecureComponent = {
                    parent: this.name,
                    name: this.name + '.threedsecure',
                    displayArea: 'threedsecure',
                    component: 'OnTap_MasterCard/js/view/payment/threedsecure',
                    config: {
                        id: this.item.method,
                        messages: this.messageContainer,
                        checkUrl: config.check_url,
                        onComplete: $.proxy(this.threeDSecureCheckSuccess, this),
                        onError: $.proxy(this.threeDSecureCheckFailed, this),
                        onCancel: $.proxy(this.threeDSecureCancelled, this)
                    }
                };
                layout([threeDSecureComponent]);

                return this;
            },

            threeDSecureCheckSuccess: function () {
                this.isPlaceOrderActionAllowed(true);
                this.placeOrder();
            },

            threeDSecureCheckFailed: function () {
                console.error('3DS check failed', arguments);
                fullScreenLoader.stopLoader();
                this.isPlaceOrderActionAllowed(true);
            },

            threeDSecureCancelled: function () {
                this.isPlaceOrderActionAllowed(true);
            }
        });
    }
);
