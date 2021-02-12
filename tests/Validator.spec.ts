import { TokenType, ValidatorBuilder, IdTokenTokenValidator, VerifiableCredentialTokenValidator, VerifiablePresentationTokenValidator, IExpectedVerifiableCredential, IExpectedVerifiablePresentation, IExpectedIdToken, IExpectedSiop, IExpectedSelfIssued, Validator, CryptoBuilder, ManagedHttpResolver, ClaimToken } from '../lib/index';
import { IssuanceHelpers } from './IssuanceHelpers';
import TestSetup from './TestSetup';
import ValidationQueue from '../lib/input_validation/ValidationQueue';
import { Crypto, SelfIssuedTokenValidator } from '../lib/index';
import VerifiableCredentialConstants from '../lib/verifiable_credential/VerifiableCredentialConstants';
import { CryptoFactoryNode, IPayloadProtectionSigning, JoseBuilder, KeyReference, KeyStoreInMemory, KeyStoreKeyVault, KeyUse, LongFormDid, Subtle } from 'verifiablecredentials-crypto-sdk-typescript';
import Credentials from './Credentials';
import { ClientSecretCredential } from '@azure/identity';
const clone = require('clone');

describe('Validator', () => {
  let crypto: Crypto;
  let signingKeyReference: KeyReference;
  let setup: TestSetup;
  let originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
  beforeEach(async () => {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 60000;
    setup = new TestSetup();
    signingKeyReference = setup.defaulSigKey;
    crypto = setup.crypto
    await setup.generateKeys();
  });
  afterEach(async () => {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout;
    setup.fetchMock.reset();
  });

  it('should validate id token', async () => {
    const [request, options, siop] = await IssuanceHelpers.createRequest(setup, TokenType.idToken, true);
    const expected: IExpectedIdToken = siop.expected.filter((token: IExpectedIdToken) => token.type === TokenType.idToken)[0];

    // because we only pass in the id token we need to pass configuration as an array
    //expected.configuration = (<{ [contract: string]: string[]}>expected.configuration)[Validator.getContractIdFromSiop(siop.contract)];

    let tokenValidator = new IdTokenTokenValidator(setup.validatorOptions, expected);
    expect(() => tokenValidator.getTokens(<any>undefined, <any>undefined)).toThrowMatching((exception) => exception.message === `Not implemented` && exception.code === 'VCSDKIDTV01');

    let selfIssuedValidator = new SelfIssuedTokenValidator(setup.validatorOptions, expected);
    expect(selfIssuedValidator.isType).toEqual(TokenType.selfIssued);
    expect(() => selfIssuedValidator.getTokens(<any>undefined, <any>undefined)).toThrowMatching((exception) => exception.message === `Not implemented` && exception.code === 'VCSDKSITV01');

    let validator = new ValidatorBuilder(crypto)
      .useValidators(tokenValidator)
      .useTrustedIssuerConfigurationsForIdTokens([setup.defaultIdTokenConfiguration])
      .build();

    let response = await validator.validate(siop.idToken.rawToken);
    expect(response.result).toBeTruthy();
    expect(response.validationResult?.idTokens).toBeDefined();

    validator = new ValidatorBuilder(crypto)
      .useTrustedIssuerConfigurationsForIdTokens([setup.defaultIdTokenConfiguration])
      .build();
    response = await validator.validate(siop.idToken.rawToken);
    expect(response.result).toBeTruthy();
    expect(response.validationResult?.idTokens).toBeDefined();

    //Redefine the urls
    validator = validator.builder.useTrustedIssuerConfigurationsForIdTokens([setup.defaultIdTokenConfiguration])
      .build();
    response = await validator.validate(siop.idToken.rawToken);
    expect(response.result).toBeTruthy();
    expect(validator.builder.trustedIssuerConfigurationsForIdTokens).toEqual([setup.defaultIdTokenConfiguration]);
    expect(response.validationResult?.verifiablePresentations).toBeUndefined();

    tokenValidator = new IdTokenTokenValidator(setup.validatorOptions, expected);

    // Negative cases
    // Bad configuration endpoint
    const clonedExpected = clone(expected);
    clonedExpected.configuration = ['xxx'];
    tokenValidator = new IdTokenTokenValidator(setup.validatorOptions, clonedExpected);
    validator = new ValidatorBuilder(crypto)
      .useValidators(tokenValidator)
      .build();

    response = await validator.validate(siop.idToken.rawToken);
    expect(response.result).toBeFalsy();
    expect(response.detailedError).toEqual(`Could not fetch token configuration`);
    expect(response.code).toEqual('VCSDKVAHE34');
  });

  it('should validate verifiable credentials', async () => {
    const [request, options, siop] = await IssuanceHelpers.createRequest(setup, TokenType.verifiableCredential, true);
    const expected: any = siop.expected.filter((token: IExpectedVerifiableCredential) => token.type === TokenType.verifiableCredential)[0];

    const tokenValidator = new VerifiableCredentialTokenValidator(setup.validatorOptions, expected);
    expect(() => tokenValidator.getTokens(<any>undefined, <any>undefined)).toThrowMatching((exception) => exception.message === `Not implemented` && exception.code === 'VCSDKVCTV01');

    const validator = new ValidatorBuilder(crypto)
      .useValidators(tokenValidator)
      .build();

    let response = await validator.validate(siop.vc.rawToken);
    expect(response.result).toBeTruthy();

  });

  it('should validate verifiable presentations', async () => {
    const [request, options, siop] = await IssuanceHelpers.createRequest(setup, TokenType.verifiablePresentationJwt, true);
    const vcExpected: IExpectedVerifiableCredential = siop.expected.filter((token: IExpectedVerifiableCredential) => token.type === TokenType.verifiableCredential)[0];
    const vpExpected: IExpectedVerifiablePresentation = siop.expected.filter((token: IExpectedVerifiablePresentation) => token.type === TokenType.verifiablePresentationJwt)[0];

    // the map gets its key from the created request
    const vcAttestationName = Object.keys(siop.attestations.presentations)[0];
    const map: any = {
      siop: vcExpected
    };
    map[vcAttestationName] = vcExpected;

    const vpValidator = new VerifiablePresentationTokenValidator(setup.validatorOptions, crypto, vpExpected);
    const vcValidator = new VerifiableCredentialTokenValidator(setup.validatorOptions, map);
    let validator = new ValidatorBuilder(crypto)
      .useValidators([vcValidator, vpValidator])
      .enableFeatureVerifiedCredentialsStatusCheck(false)
      .build();

    // Check validator types
    expect(vpValidator.isType).toEqual(TokenType.verifiablePresentationJwt);
    expect(vcValidator.isType).toEqual(TokenType.verifiableCredential);

    // Check VP validator
    let queue = new ValidationQueue();
    queue.enqueueToken('vp', siop.vp);
    let response = await vpValidator.validate(queue, queue.getNextToken()!, setup.defaultUserDid);
    expect(response.result).toBeTruthy('vpValidator succeeded');
    expect(response.tokensToValidate![`DrivingLicense`].rawToken).toEqual(siop.vc.rawToken);

    let clonedResult = clone(response);
    delete clonedResult.payloadObject.vp;
    response = vpValidator.getTokens(clonedResult, queue);
    expect(response.result).toBeFalsy(response.detailedError);
    expect(response.detailedError).toEqual('No verifiable credential');
    expect(response.code).toEqual('VCSDKVPTV01');

    // Check VC validator
    queue = new ValidationQueue();
    queue.enqueueToken(vcAttestationName, siop.vc);
    response = await vcValidator.validate(queue, queue.getNextToken()!, setup.defaultUserDid);
    expect(response.result).toBeTruthy('vcValidator succeeded');

    // Check validator
    queue = new ValidationQueue();
    queue.enqueueToken('vp', siop.vp);
    let token = queue.getNextToken()!.tokenToValidate;
    response = await validator.validate(token);
    expect(response.result).toBeTruthy('check validator');
    expect(response.validationResult?.verifiableCredentials).toBeDefined();

    // Negative cases
    // No validator
    validator = new ValidatorBuilder(crypto)
      .useValidators([])
      .build();
    queue = new ValidationQueue();
    queue.enqueueToken('vp', siop.vp);
    response = await validator.validate(queue.getNextToken()!.tokenToValidate);
    expect(response.result).toBeFalsy();
    expect(response.detailedError).toEqual('verifiablePresentationJwt does not has a TokenValidator');
    expect(response.code).toEqual('VCSDKVTOR02');

    // Test validator with missing VC validator
    validator = new ValidatorBuilder(crypto)
      .useValidators(vpValidator)
      .enableFeatureVerifiedCredentialsStatusCheck(false)
      .build();
    queue = new ValidationQueue();
    queue.enqueueToken('vp', siop.vp);
    response = await validator.validate(queue.getNextToken()!.tokenToValidate);
    expect(response.result).toBeFalsy();
    expect(response.detailedError).toEqual('verifiableCredential does not has a TokenValidator');
    expect(response.code).toEqual('VCSDKVTOR02');
  });

  it('should validate presentation siop', async () => {
    const [request, options, siop] = await IssuanceHelpers.createRequest(setup, TokenType.verifiablePresentationJwt, false);
    const siopExpected = siop.expected.filter((token: IExpectedSiop) => token.type === TokenType.siopPresentationAttestation)[0];
    const vcExpected = siop.expected.filter((token: IExpectedVerifiableCredential) => token.type === TokenType.verifiableCredential)[0];


    // Check validator, only VCs in presentations
    let validator = new ValidatorBuilder(crypto)
      .useAudienceUrl(siopExpected.audience)
      .useTrustedIssuersForVerifiableCredentials(vcExpected.contractIssuers)
      .enableFeatureVerifiedCredentialsStatusCheck(false)
      .build();

    expect(validator.builder.audienceUrl).toEqual(siopExpected.audience);

    const queue = new ValidationQueue();
    queue.enqueueToken('siopPresentationAttestation', request);
    let response = await validator.validate(queue.getNextToken()!.tokenToValidate);
    expect(response.result).toBeTruthy();
    expect(response.status).toEqual(200);
    expect(validator.tokenValidators['siopPresentationAttestation'].isType).toEqual(TokenType.siopPresentationAttestation);
    expect(response.validationResult?.siop).toBeDefined();
    expect(response.validationResult?.verifiablePresentations).toBeDefined();
    expect(response.detailedError).toBeUndefined();
    expect(response.tokensToValidate).toBeUndefined();
    expect(response.validationResult?.did).toEqual(setup.defaultUserDid);
    expect(response.validationResult?.siopJti).toEqual(IssuanceHelpers.jti);
    expect(response.validationResult?.idTokens).toBeUndefined();
    expect(response.validationResult?.selfIssued).toBeUndefined();
    expect(response.validationResult?.verifiableCredentials).toBeDefined();
    expect(response.validationResult?.verifiableCredentials!['DrivingLicense'].decodedToken.vc.credentialSubject.givenName).toEqual('Jules');

    // Negative cases
    // map issuer to other credential type
    validator = validator.builder.useTrustedIssuersForVerifiableCredentials({ someCredential: vcExpected.contractIssuers.DrivingLicense }).build();
    queue.enqueueToken('siopPresentationAttestation', request);
    response = await validator.validate(queue.getNextToken()!.tokenToValidate);
    expect(response.result).toBeFalsy();
    expect(response.detailedError).toEqual(`Expected should have contractIssuers set for verifiableCredential. Missing contractIssuers for 'DrivingLicense'.`);
    expect(response.code).toEqual('VCSDKVCVA16');
    expect(response.status).toEqual(403);

    // bad payload
    queue.enqueueToken('siopPresentationAttestation', <any>{ claims: {} });
    response = await validator.validate(<any>queue.getNextToken()!);
    expect(response.detailedError).toEqual('Wrong token type. Expected string or ClaimToken');
    expect(response.code).toEqual('VCSDKVTOR01');

    let spiedMethod: any = ClaimToken.create;
    let createSpy: jasmine.Spy = spyOn(ClaimToken, 'create').and.callFake((): ClaimToken => {
      throw new Error('some create error');
    });
    queue.enqueueToken('siopPresentationAttestation', request);
    response = await validator.validate(<any>queue.getNextToken()!.tokenToValidate.rawToken);
    expect(response.detailedError).toEqual('some create error');
    createSpy.and.callFake((token: any, id: any): { [key: string]: ClaimToken } => {
      return spiedMethod(token, id);
    });

    spiedMethod = ClaimToken.getClaimTokensFromAttestations;
    let getClaimTokensFromAttestationsSpy: jasmine.Spy = spyOn(ClaimToken, 'getClaimTokensFromAttestations').and.callFake((): { [key: string]: ClaimToken } => {
      throw new Error('some error');
    });
    queue.enqueueToken('siopPresentationAttestation', request);
    response = await validator.validate(queue.getNextToken()!.tokenToValidate);
    expect(response.detailedError).toEqual('some error');
    getClaimTokensFromAttestationsSpy.and.callFake((attestations: any): { [key: string]: ClaimToken } => {
      return spiedMethod(attestations);
    });

    spiedMethod = Validator.getClaimToken;
    let getClaimTokenSpy: jasmine.Spy = spyOn(Validator, 'getClaimToken').and.callFake((): ClaimToken => {
      throw new Error('some getClaimToken error');
    });
    queue.enqueueToken('siopPresentationAttestation', request);
    response = await validator.validate(<any>queue.getNextToken()!.tokenToValidate.rawToken);
    expect(response.detailedError).toEqual('some getClaimToken error');

    getClaimTokenSpy.and.callFake((): ClaimToken => {
      return <ClaimToken>{ type: <any>'test' };
    });
    queue.enqueueToken('siopPresentationAttestation', request);
    validator.tokenValidators['test'] = validator.tokenValidators['siopPresentationAttestation'];
    response = await validator.validate(<any>queue.getNextToken()!.tokenToValidate.rawToken);
    expect(response.detailedError).toEqual(`test is not supported`);
    expect(response.code).toEqual('VCSDKVTOR03');
    getClaimTokenSpy.and.callFake((queueItem: any): ClaimToken => {
      return spiedMethod(queueItem);
    });
  });


  xit('should validate siop and status', async () => {
    const [request, options, siop] = await IssuanceHelpers.createRequest(setup, TokenType.verifiablePresentationJwt, true);
    const siopExpected = siop.expected.filter((token: IExpectedSiop) => token.type === TokenType.siopIssuance)[0];
    const vpExpected = siop.expected.filter((token: IExpectedVerifiableCredential) => token.type === TokenType.verifiablePresentationJwt)[0];
    const vcExpected = siop.expected.filter((token: IExpectedVerifiableCredential) => token.type === TokenType.verifiableCredential)[0];
    const idTokenExpected = siop.expected.filter((token: IExpectedIdToken) => token.type === TokenType.idToken)[0];
    const siExpected = siop.expected.filter((token: IExpectedSelfIssued) => token.type === TokenType.selfIssued)[0];


    // Check validator
    let validator = new ValidatorBuilder(crypto)
      .useAudienceUrl(siopExpected.audience)
      .useTrustedIssuerConfigurationsForIdTokens(idTokenExpected.configuration)
      .useTrustedIssuersForVerifiableCredentials(vcExpected.contractIssuers)
      .useResolver(new ManagedHttpResolver(VerifiableCredentialConstants.UNIVERSAL_RESOLVER_URL))
      .enableFeatureVerifiedCredentialsStatusCheck(true)
      .build();

    const queue = new ValidationQueue();
    queue.enqueueToken('siop', request);
    const response = await validator.validate(queue.getNextToken()!.tokenToValidate);
    expect(response.result).toBeTruthy(response.detailedError);
    expect(response.status).toEqual(200);

  });


  it('should validate siop with default validators', async () => {
    const [request, options, siop] = await IssuanceHelpers.createRequest(setup, TokenType.verifiablePresentationJwt, true);
    const siopExpected = siop.expected.filter((token: IExpectedSiop) => token.type === TokenType.siopIssuance)[0];
    const vpExpected = siop.expected.filter((token: IExpectedVerifiableCredential) => token.type === TokenType.verifiablePresentationJwt)[0];
    const vcExpected = siop.expected.filter((token: IExpectedVerifiableCredential) => token.type === TokenType.verifiableCredential)[0];
    const idTokenExpected = siop.expected.filter((token: IExpectedIdToken) => token.type === TokenType.idToken)[0];
    const siExpected = siop.expected.filter((token: IExpectedSelfIssued) => token.type === TokenType.selfIssued)[0];


    // Check validator
    let validator = new ValidatorBuilder(crypto)
      .useAudienceUrl(siopExpected.audience)
      .useTrustedIssuerConfigurationsForIdTokens(idTokenExpected.configuration)
      .useTrustedIssuersForVerifiableCredentials(vcExpected.contractIssuers)
      .useResolver(new ManagedHttpResolver(VerifiableCredentialConstants.UNIVERSAL_RESOLVER_URL))
      .enableFeatureVerifiedCredentialsStatusCheck(false)
      .build();

    expect(validator.resolver).toBeDefined();

    const queue = new ValidationQueue();
    queue.enqueueToken('siop', request);
    const response = await validator.validate(queue.getNextToken()!.tokenToValidate);
    expect(response.result).toBeTruthy();
    expect(response.status).toEqual(200);
    expect(response.detailedError).toBeUndefined();
    expect(response.tokensToValidate).toBeUndefined();
    expect(response.validationResult?.did).toEqual(setup.defaultUserDid);
    expect(response.validationResult?.siopJti).toEqual(IssuanceHelpers.jti);
    expect(response.validationResult?.siop).toBeDefined();
    expect(response.validationResult?.verifiablePresentations).toBeDefined();
    expect(response.validationResult?.idTokens).toBeDefined();
    for (let idtoken in response.validationResult?.idTokens) {
      expect(response.validationResult?.idTokens[idtoken].decodedToken.upn).toEqual('jules@pulpfiction.com');
    }
    expect(response.validationResult?.selfIssued).toBeDefined();
    expect(response.validationResult?.selfIssued!.decodedToken.name).toEqual('jules');
    expect(response.validationResult?.verifiableCredentials).toBeDefined();
    expect(response.validationResult?.verifiableCredentials!['DrivingLicense'].decodedToken.vc.credentialSubject.givenName).toEqual('Jules');

    // Negative cases

  });

  it('should read the contract id with no spaces', () => {
    const id = 'foo';
    const url = `https://test.com/v1.0/abc/def/contracts/${id}`;
    const response = Validator.readContractId(url);
    expect(response).toEqual(id);
  });

  it('should read the contract id with spaces', () => {
    const id = 'foo bar';
    const url = `https://test.com/v1.0/abc/def/contracts/${encodeURIComponent(id)}`;
    const response = Validator.readContractId(url);
    expect(response).toEqual(id);
  });

  it('should read the contract id with spaces and query', () => {
    const id = 'foo bar';
    const url = `https://test.com/v1.0/abc/def/contracts/${encodeURIComponent(id)}?qs=abcdefggh`;
    const response = Validator.readContractId(url);
    expect(response).toEqual(id);
  });

  it('should validate a siop', async () => {
    setup.fetchMock.reset();
    let crypto = new CryptoBuilder()
      .build();

    let validator = new ValidatorBuilder(crypto)
      .build();

    const req = 'your token here';
    console.log(req);
    const response = await validator.validate(req);
    expect(response.result).toBeFalsy();
  });
});