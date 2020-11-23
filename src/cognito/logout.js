/* eslint-disable prefer-promise-reject-errors */
const httpStatus = require('http-status');
const amazonCognitoIdentity = require('amazon-cognito-identity-js');
const AWS = require('aws-sdk');
const auth = require('../utils/auth');
const { ALLOW_CORS } = require('../utils/cors');

exports.lambdaHandler = async (event, context) => {
  const response = {
    statusCode: httpStatus.OK,
    headers: ALLOW_CORS
  };

  const body = JSON.parse(event.body);
  const token = event.headers.Authorization;
  const authorized = await auth.authorizeBearerToken(token);
  
  if (!authorized.payload) {
    response.statusCode = httpStatus.UNAUTHORIZED;
    return response;
  }

  try {
    const cognito = new AWS.CognitoIdentityServiceProvider({
      apiVersion: '2016-04-18'
    });

    const AccessToken = token.split(' ')[1];
    const UserAttributes = setAttributes(body);

    await auth.updateProfile(cognito, { AccessToken, UserAttributes });
    const data = await auth.signOut(cognito, { AccessToken });
    response.body = JSON.stringify({ data });
  } catch (err) {
    response.statusCode = httpStatus.BAD_REQUEST;
    response.body = JSON.stringify({ errMsg: err.message });
  }

  return response;
};

function setAttributes (body) {
  const attributeList = [];

  attributeList.push(
    new amazonCognitoIdentity.CognitoUserAttribute({
      Name: 'custom:status',
      Value: body.status
    })
  );

  return attributeList;
};
