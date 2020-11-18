const httpStatus = require('http-status');
const AWS = require('aws-sdk');
const { authorizeBearerToken } = require('../utils/auth');

exports.lambdaHandler = async (event, context) => {
  let data = {};
  const response = {
    statusCode: httpStatus.OK,
    headers: {
      'Access-Control-Allow-Origin': '*'
    }
  };

  const token = event.headers.Authorization;
  const authorized = await authorizeBearerToken(token);

  if (!authorized.payload) {
    response.statusCode = httpStatus.UNAUTHORIZED;
    return response;
  }

  try {
    const cognito = new AWS.CognitoIdentityServiceProvider({
      apiVersion: '2016-04-18'
    });

    const user = await cognito
      .adminGetUser({
        UserPoolId: process.env.APP_POOL_ID,
        Username: authorized.payload.sub
      })
      .promise();
    data = formatData(user);
    response.body = JSON.stringify(data);
  } catch (err) {
    response.statusCode = httpStatus.BAD_REQUEST;
    response.body = JSON.stringify({ errMsg: err.message });
  }

  return response;
};

function formatData (data) {
  const ret = {};
  const fields = {
    email: 'email',
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
