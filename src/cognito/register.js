const httpStatus = require('http-status');
const amazonCognitoIdentity = require('amazon-cognito-identity-js');
const { ALLOW_CORS } = require('../utils/cors');
const auth = require('../utils/auth');

exports.lambdaHandler = async (event, context) => {
  const response = {
    statusCode: httpStatus.OK,
    headers: ALLOW_CORS
  };

  try {
    const body = JSON.parse(event.body);

    if (!body.email) {
      response.statusCode = httpStatus.BAD_REQUEST;
      response.body = JSON.stringify({ errMsg: 'Email is missing' });
      return response;
    } else if (!body.password) {
      response.statusCode = httpStatus.BAD_REQUEST;
      response.body = JSON.stringify({ errMsg: 'Password is missing' });
      return response;
    }

    const poolData = {
      UserPoolId: process.env.APP_POOL_ID,
      ClientId: process.env.APP_CLIENT_ID
    };

    const userPool = new amazonCognitoIdentity.CognitoUserPool(poolData);
    const attributeList = setAttributes(body);
    const data = await auth.register(userPool, attributeList, body);
    response.body = JSON.stringify({ data });
  } catch (err) {
    response.statusCode = httpStatus.BAD_REQUEST;
    if (err.code === 'InvalidPasswordException' || err.code === 'InvalidParameterException') {
      response.body = JSON.stringify({ errMsg: 'Password too weak. Please make sure it meets listed conditions.' });
    } else {
      response.body = JSON.stringify({ errMsg: err.message });
    }
  }

  return response;
};

// To test, just use the status and role fields
// Admin should be registered by AWS admin
function setAttributes (body) {
  const attributeList = [];

  attributeList.push(
    new amazonCognitoIdentity.CognitoUserAttribute({
      Name: 'custom:status',
      Value: body.status
    })
  );

  attributeList.push(
    new amazonCognitoIdentity.CognitoUserAttribute({
      Name: 'custom:role',
      Value: 'user'
    })
  );

  return attributeList;
};
