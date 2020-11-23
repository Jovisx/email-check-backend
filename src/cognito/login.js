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

  try {
    const body = JSON.parse(event.body);

    if (!body.userName) {
      response.statusCode = httpStatus.BAD_REQUEST;
      response.body = JSON.stringify({ errMsg: 'User name is missing' });
      return response;
    } else if (!body.password) {
      response.statusCode = httpStatus.BAD_REQUEST;
      response.body = JSON.stringify({ errMsg: 'Password is missing' });
      return response;
    } else if (!body.status) {
      response.statusCode = httpStatus.BAD_REQUEST;
      response.body = JSON.stringify({ errMsg: 'Status is missing' });
      return response;
    }

    const authenticationData = {
      Username: body.userName,
      Password: body.password
    };

    const authenticationDetails = new amazonCognitoIdentity.AuthenticationDetails(
      authenticationData
    );

    const poolData = {
      UserPoolId: process.env.APP_POOL_ID,
      ClientId: process.env.APP_CLIENT_ID
    };

    const userPool = new amazonCognitoIdentity.CognitoUserPool(poolData);
    const userData = {
      Username: body.userName,
      Pool: userPool
    };

    const cognitoUser = new amazonCognitoIdentity.CognitoUser(userData);
    const data = await login(cognitoUser, authenticationDetails);
    response.body = JSON.stringify({ data });

    // update user status: just for test
    const cognito = new AWS.CognitoIdentityServiceProvider({
      apiVersion: '2016-04-18'
    });
    const UserAttributes = setAttributes(body);
    const params = {
      AccessToken: data.accessToken,
      UserAttributes
    };
    await updateProfile(cognito, params);
  } catch (err) {
    response.statusCode = httpStatus.BAD_REQUEST;
    response.body = JSON.stringify({ errMsg: err.message });
  }

  return response;
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
