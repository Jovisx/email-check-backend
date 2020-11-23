/* eslint-disable prefer-promise-reject-errors */
const httpStatus = require('http-status');
const amazonCognitoIdentity = require('amazon-cognito-identity-js');
const AWS = require('aws-sdk');
const { ALLOW_CORS } = require('../utils/cors');

exports.lambdaHandler = async (event, context) => {
  const response = {
    statusCode: httpStatus.OK,
    headers: ALLOW_CORS
  };

  const token = event.headers.Authorization;
  const authorized = await authService.authorizeBearerToken(token);
  if (!authorized.payload) {
    response.statusCode = httpStatus.UNAUTHORIZED;
    return response;
  }

  let data;
  try {
    const cognitoidentityserviceprovider = new AWS.CognitoIdentityServiceProvider(
      {
        apiVersion: '2016-04-18'
      }
    );
    const params = {
      AccessToken: token.split(' ')[1]
    };
    data = await signOut(cognitoidentityserviceprovider, params);
    response.body = JSON.stringify({ data });
  } catch (err) {
    response.statusCode = httpStatus.BAD_REQUEST;
    response.body = JSON.stringify({ errMsg: err.message });
  }
  return response;
};

const signOut = async (cognitoidentityserviceprovider, params) => {
  return new Promise((resolve, reject) => {
    cognitoidentityserviceprovider.globalSignOut(params, function (err, data) {
      if (err) reject({ message: err.message });
      else resolve({ message: 'User has successfully logout.' });
    });
  });
};
