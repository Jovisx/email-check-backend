const httpStatus = require('http-status');
const { v4: uuidv4 } = require('uuid');
const auth = require('../../utils/auth');
const utils = require('../../utils/utils');
const { ALLOW_CORS } = require('../../utils/cors');

/**
 * A HTTP post method to add one email to a DynamoDB table.
 */
exports.lambdaHandler = async (event) => {
  const response = {
    statusCode: httpStatus.OK,
    headers: ALLOW_CORS,
    body: null
  };

  try {
    const { statusCode } = await auth.checkAuthAndGetUserData(event);

    if (statusCode) {
      response.statusCode = statusCode;
      return response;
    }
  
    let emailData = JSON.parse(event.body);

    for (let i = 0; i < emailData.length; i++) {
      // Add email into email pool
      emailData[i].id = uuidv4();
      await utils.addEmailToEmailTable(emailData[i]);
      // Add id(email id), timestamp(createdAt), userId(just empty user) into process pool
      await utils.addEmailToProcessTable(emailData[i].id);
      // Third, update item count of tables
      await utils.increaseEmailCount();
      await utils.increaseProcessCount();
    }
    response.body = event.body;
  } catch (err) {
    response.statusCode = httpStatus.INTERNAL_SERVER_ERROR;
    response.body = JSON.stringify({ errMsg: err.message });
  }

  return response;
};
