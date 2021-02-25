/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import ErrorHelpers from '../error_handling/ErrorHelpers';
import { IExpectedSelfIssued, ITokenValidator, TokenType, ValidationError } from '../index';
import { IValidationResponse } from '../input_validation/IValidationResponse';
import ValidationQueue from '../input_validation/ValidationQueue';
import ValidationQueueItem from '../input_validation/ValidationQueueItem';
import IValidatorOptions from '../options/IValidatorOptions';
import ValidationOptions from '../options/ValidationOptions';
const errorCode = (error: number) => ErrorHelpers.errorCode('VCSDKSITV', error);

/**
 * Class to validate a token
 */
export default class SelfIssuedTokenValidator implements ITokenValidator {

  /**
   * Create new instance of <see @class SelfIssuedTokenValidator>
   * @param validatorOption The options used during validation
   * @param expected values to find in the token to validate
   */
  constructor (private validatorOption: IValidatorOptions, private expected: IExpectedSelfIssued) {
  }


  /**
   * Validate the token
   * @param queue with tokens to validate
   * @param queueItem under validation
   */
  public async validate(_queue: ValidationQueue, _queueItem:ValidationQueueItem): Promise<IValidationResponse> { 
    const options = new ValidationOptions(this.validatorOption, TokenType.selfIssued);

    const validationResponse: IValidationResponse = {
      result: true,
      status: 200
    };
    
    return validationResponse;
  }

  /**
   * Get tokens from current item and add them to the queue.
   * @param validationResponse The response for the requestor
   * @param queue with tokens to validate
   */
  public getTokens(_validationResponse: IValidationResponse, _queue: ValidationQueue ): IValidationResponse {
    throw new ValidationError(`Not implemented`, errorCode(1));
  }

  /**
   * Gets the type of token to validate
   */
  public get isType(): TokenType {
    return TokenType.selfIssued;
  }
}

