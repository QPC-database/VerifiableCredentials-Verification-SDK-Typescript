/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TokenType, IExpectedVerifiablePresentation, ITokenValidator, ClaimToken, VerifiableCredentialValidation } from '../index';
import { IValidationResponse } from '../input_validation/IValidationResponse';
import ValidationOptions from '../options/ValidationOptions';
import { VerifiablePresentationValidation } from '../input_validation/VerifiablePresentationValidation';
import IValidatorOptions from '../options/IValidatorOptions';
import ValidationQueue from '../input_validation/ValidationQueue';
import ValidationQueueItem from '../input_validation/ValidationQueueItem';
import { Crypto } from '../index';
import ErrorHelpers from '../error_handling/ErrorHelpers';
const errorCode = (error: number) => ErrorHelpers.errorCode('VCSDKVPTV', error);

/**
 * Class to validate a token
 */
export default class VerifiablePresentationTokenValidator implements ITokenValidator {

  /**
   * Create new instance of <see @class VerifiablePresentationTokenValidator>
   * @param validatorOption The options used during validation
   * @param expected values to find in the token to validate
   */
   constructor (private validatorOption: IValidatorOptions, private expected: IExpectedVerifiablePresentation ) {
  }

  /**
   * Validate the token
   * @param queue with tokens to validate
   * @param queueItem under validation
   * @param siopDid needs to be equal to audience of VP
   */
  public async validate(queue: ValidationQueue, queueItem: ValidationQueueItem, siopDid: string): Promise<IValidationResponse> { 
    const options = new ValidationOptions(this.validatorOption, TokenType.verifiablePresentationJwt);
    const validator = new VerifiablePresentationValidation(options, this.expected, siopDid, queueItem.id);
    let validationResult = await validator.validate(<string>queueItem.tokenToValidate.rawToken);

    if (validationResult.result) {
      validationResult = this.getTokens(validationResult, queue);
    }

    return validationResult as IValidationResponse;
  }
  
  /**
   * Get tokens from current item and add them to the queue.
   * @param validationResponse The response for the requestor
   * @param queue with tokens to validate
   */
  public getTokens(validationResponse: IValidationResponse, queue: ValidationQueue ): IValidationResponse {
    if (!validationResponse.payloadObject.vp || !validationResponse.payloadObject.vp.verifiableCredential) {
      return {
        result: false,
        status: 403,
        code: errorCode(1),
        detailedError: 'No verifiable credential'
      };
    }

    const vc = validationResponse.payloadObject.vp.verifiableCredential;
    validationResponse.tokensToValidate = {};
    for (let token in vc) {
      const claimToken = ClaimToken.create(vc[token]);
      const vcType = VerifiableCredentialValidation.getVerifiableCredentialType(claimToken.decodedToken.vc || claimToken.decodedToken);
      validationResponse.tokensToValidate[vcType] = claimToken; 
      queue.enqueueToken(vcType, claimToken);    
    }

    return validationResponse;
  }

  /**
   * Gets the type of token to validate
   */
  public get isType(): TokenType {
    return TokenType.verifiablePresentationJwt;
  }
}

