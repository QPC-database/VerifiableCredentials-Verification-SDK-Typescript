/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { KeyUse, RequestorBuilder } from '../lib';
import PresentationDefinition from './models/PresentationDefinitionSample1'

describe('Requestor', () =>{
  it('should create a requestor', async () => {
    const requestor = new RequestorBuilder(PresentationDefinition.presentationExchangeDefinition)
      .build();

    // Generate key
    await requestor.builder.crypto.generateKey(KeyUse.Signature);
    const request = await requestor.create();
    expect(request.result).toBeTruthy();
    expect(requestor.payload.response_type).toEqual('id_token');
    expect(requestor.payload.scope).toEqual('openid did_authn');
    expect(requestor.payload.response_mode).toEqual('form_post');
    expect(requestor.payload.client_id).toEqual('https://response.example.com');
    expect(requestor.payload.redirect_uri).toEqual('https://response.example.com');
    expect(requestor.audienceUrl()).toEqual('https://response.example.com');
    
  });
  it('should return trusted issuers', () => {
    const requestor = new RequestorBuilder(PresentationDefinition.presentationExchangeDefinition)
      .build();

      expect(() => requestor.trustedIssuerConfigurationsForIdTokens()).toThrowMatching((exception) => exception.message === `Id Tokens only supported in Attestation Requestor model.` && exception.code === 'VCSDKRequ01');
      expect(() => requestor.trustedIssuersForVerifiableCredentials()).toThrowMatching((exception) => exception.message === `trustedIssuersForVerifiableCredentials not supported for presentation exchange. Requires constraints.` && exception.code === 'VCSDKRequ02');
    })
});