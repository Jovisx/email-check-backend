/* eslint-disable prefer-promise-reject-errors */
const httpStatus = require('http-status');
const AWS = require('aws-sdk');
const axios = require('axios');
const jwkToPem = require('jwk-to-pem');
const jwt = require('jsonwebtoken');

const validate = async (token) => {
  try {
    const data = await verifyToken(token);
    return data;
  } catch (err) {
    return { payload: null, message: 'error' };
  }
};

const authorizeBearerToken = async (token) => {
  if (!token || !token.toLowerCase().startsWith('bearer ')) {
    return { payload: null };
  } else {
    token = token.substring(7, token.length);
    const isAuthorize = await validate(token);
    if (!isAuthorize || !isAuthorize.payload) {
      return { payload: null };
    } else {
      return { payload: isAuthorize.payload };
    }
  }
};

const verifyToken = async (token) => {
  return new Promise((resolve, reject) => {
    axios
      .get(
        `https://cognito-idp.us-east-2.amazonaws.com/${process.env.APP_POOL_ID}/.well-known/jwks.json`,
        {
          json: true
        }
      )
      .then(async (body) => {
        if (body.status === 200) {
          const pems = {};
          const keys = body.data.keys;
          for (let i = 0; i < keys.length; i++) {
            const keyId = keys[i].kid;
            const modulus = keys[i].n;
            const exponent = keys[i].e;
            const keyType = keys[i].kty;
            const jwk = { kty: keyType, n: modulus, e: exponent };
            const pem = jwkToPem(jwk);
            pems[keyId] = pem;
          }
          const decodedJwt = jwt.decode(token, { complete: true });
          if (!decodedJwt) {
            reject({ payload: null, message: 'Not a valid JWT token' });
          }
          const kid = decodedJwt.header.kid;
          const pem = pems[kid];
          if (!pem) {
            reject({ payload: null, message: 'Invalid token' });
          }

          jwt.verify(token, pem, function (err, payload) {
            if (err) {
              reject({ payload: null, message: 'Invalid token' });
            } else {
              resolve({ payload, message: null });
            }
          });
        } else {
          reject({ payload: null, message: 'Invalid Token.' });
        }
      })
      .catch((err) => {
        reject({ payload: null, message: err.message });
      });
  });
};

const checkAuthAndGetUserData = async (event) => {
  let data = {
    statusCode: null,
    user: null
  };
  const token = event.headers.Authorization;
  const authorized = await authorizeBearerToken(token);

  if (!authorized.payload) {
    data.statusCode = httpStatus.UNAUTHORIZED;
    return data;
  }

  const cognito = new AWS.CognitoIdentityServiceProvider({
    apiVersion: '2016-04-18'
  });

  const user = await cognito
    .adminGetUser({
      UserPoolId: process.env.APP_POOL_ID,
      Username: authorized.payload.sub
    })
    .promise();
    data.user = formatUserData(user);

  return data;
};

function formatUserData (data) {
  const ret = {};
  const fields = {
    email: 'id',
    'custom:status': 'status',
    'custom:role': 'role'
  };
  data.UserAttributes.forEach((element) => {
    if (fields[element.Name]) {
      ret[fields[element.Name]] = element.Value;
    }
  });

  return ret;
};

const updateProfile = async (cognito, params) => {
  return new Promise((resolve, reject) => {
    cognito.updateUserAttributes(params, function (err, data) {
      if (err) {
        reject({ message: err.message });
      } else {
        resolve({ message: 'Success' });
      }
    });
  });
};

const register = async (userPool, attributeList, body) => {
  return new Promise((resolve, reject) => {
    userPool.signUp(body.email, body.password, attributeList, null, function (err, result) {
      if (err) {
        reject(err);
      } else {
        const codeDeliveryDetails = result.codeDeliveryDetails;
        const message = codeDeliveryDetails
          ? `Verification code has been sent to your ${codeDeliveryDetails.AttributeName}: ${codeDeliveryDetails.Destination}`
          : 'Success';
        resolve({
          userName: result.user.getUsername(),
          message
        });
      }
    });
  });
};

const login = async (cognitoUser, authenticationDetails) => {
  return new Promise((resolve, reject) => {
    cognitoUser.authenticateUser(authenticationDetails, {
      onSuccess: async function (result) {
        const token = result.getAccessToken().getJwtToken();
        const refreshToken = result.getRefreshToken().getToken();
        const username = result.getAccessToken().payload.username;
        const exp = result.getAccessToken().payload.exp;
        resolve({
          accessToken: token,
          refreshToken,
          username,
          exp
        });
      },
      onFailure: function (err) {
        reject({ errMsg: err.message });
      }
    });
  });
};

const signOut = async (cognito, params) => {
  return new Promise((resolve, reject) => {
    cognito.globalSignOut(params, function (err, data) {
      if (err) reject({ message: err.message });
      else resolve({ message: 'User has successfully logout.' });
    });
  });
};

module.exports = {
  validate,
  authorizeBearerToken,
  formatUserData,
  checkAuthAndGetUserData,
  updateProfile,
  register,
  login,
  signOut
};
