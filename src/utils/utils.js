
const dynamodb = require('aws-sdk/clients/dynamodb');
const docClient = new dynamodb.DocumentClient();

const { PROCESSED_STATUS } = require('./const');

const emailPoolTable = process.env.EMAIL_POOL_TABLE;
const processPoolTable = process.env.PROCESS_POOL_TABLE;
const itemCountOfTable = process.env.ITEM_COUNT_TABLE;

const addEmailToEmailTable = async (data) => {
  const params = {
    TableName: emailPoolTable,
    Item: {
      id: data.id,
      subject: data.subject,
      emailLead: data.emailLead,
      status: PROCESSED_STATUS.PENDING,
      createdAt: data.createdAt,
      emailBody: data.emailBody,
      resolvedBy: ''
    }
  };
  return await docClient.put(params).promise();
};

const addEmailToProcessTable = async (emailId) => {
  const params = {
    TableName: processPoolTable,
    Item: {
      emailId,
      createdAt: Date.now(),
      startedAt: '',
      userId: ''
    }
  };
  return await docClient.put(params).promise();
};

const getTableData = async (tableName, offset, limit, LastEvaluatedKey) => {
  const params = {
    TableName: tableName,
    Limit: limit
  };

  if (LastEvaluatedKey !== null && LastEvaluatedKey !== 'null') {
    params.ExclusiveStartKey = {
      id
    } = LastEvaluatedKey;
  }
  console.log('params :>> ', params);
  const data = await docClient.scan(params).promise();
  const totalCount = await getNumberOfItem(tableName);

  const result = {
    emails: data.Items,
    offset,
    LastEvaluatedKey: data.LastEvaluatedKey.id ? data.LastEvaluatedKey.id : null,
    limit: limit,
    total: totalCount
  };

  return JSON.stringify({ data: result });
};

const updateEmailInPool = async (id, status, userId) => {
  const params = {
    TableName: emailPoolTable,
    Key: {
      id
    },
    UpdateExpression: 'set #emailStatus = :currentStatus, resolvedBy = :currentUserId',
    ExpressionAttributeNames: {
      '#emailStatus': 'status'
    },
    ExpressionAttributeValues: {
      ':currentStatus': status,
      ':currentUserId': userId
    },
    ReturnValues: 'UPDATED_NEW'
  };
  return await docClient.update(params).promise();
};

const getOldestEmailFromProcessPool = async () => {
  // get oldest email from process pool
  const params = {
    TableName: processPoolTable,
    FilterExpression: '#userId = :emptyUserId',
    ExpressionAttributeNames: {
      '#userId': 'userId'
    },
    ExpressionAttributeValues: {
      ':emptyUserId': ''
    }
  };

  let minValue = 0;
  let oldestEmail;
  let data = null;

  // Right now scan emails but we should consider to use Redis or parellel processing.
  do {
    data = await docClient.scan(params).promise();
    oldestEmail = getOldestEmail(data, minValue);
    minValue = oldestEmail.createdAt;
    params.ExclusiveStartKey = data.LastEvaluatedKey;
  } while (typeof data.LastEvaluatedKey !== 'undefined');

  return oldestEmail;
};

function getOldestEmail (data, minValue) {
  let min;
  let c = 0;

  if (minValue === 0) {
    min = data.Items[0].createdAt;
  } else {
    min = minValue;
  }

  for (let i = 0; i < data.Count; i++) {
    if (data.Items[i].createdAt < min) {
      min = data.Items[i].createdAt;
      c = i;
    }
  }

  return data.Items[c];
};

const assignEmailToUser = async (userId, email) => {
  const params = {
    TableName: processPoolTable,
    Key: {
      emailId: email.emailId
    },
    UpdateExpression: 'set userId = :currentUserId, startedAt = :currentTimestamp',
    ExpressionAttributeValues: {
      ':currentUserId': userId,
      ':currentTimestamp': Date.now()
    }
  };
  await docClient.update(params).promise();

  // Get and send this email to client
  const params1 = {
    TableName: emailPoolTable,
    Key: {
      id: email.emailId
    }
  };
  const { Item } = await docClient.get(params1).promise();
  const result = Item;
  result.createdAt = email.createdAt;

  return JSON.stringify({ data: result });
};

const unassignAllEmailsFromUser = async (userId) => {
  // check if there is email assigned already
  let data = null;
  const scanParams = {
    TableName: processPoolTable,
    FilterExpression: '#userId = :currentUserId',
    ExpressionAttributeNames: {
      '#userId': 'userId'
    },
    ExpressionAttributeValues: {
      ':currentUserId': userId
    }
  };

  do {
    data = await docClient.scan(scanParams).promise();

    if (data) {
      // update userId and timestamp in process pool
      for (let i = 0; i < data.Count; i++) {
        const item = data.Items[i];
        const params = {
          TableName: processPoolTable,
          Key: {
            emailId: item.emailId
          },
          UpdateExpression: 'set userId = :emptyUserId, startedAt = :emptyTimestamp',
          ExpressionAttributeValues: {
            ':emptyUserId': '',
            ':emptyTimestamp': ''
          }
        };
        await docClient.update(params).promise();
      }
    }
    scanParams.ExclusiveStartKey = data.LastEvaluatedKey;
  } while (typeof data.LastEvaluatedKey !== 'undefined');
};

const unassignEmailFromUser = async (emailId) => {
  const params = {
    TableName: processPoolTable,
    Key: {
      emailId
    },
    UpdateExpression: 'set userId = :emptyUserId, startedAt = :emptyTimestamp',
    ExpressionAttributeValues: {
      ':emptyUserId': '',
      ':emptyTimestamp': ''
    }
  };
  await docClient.update(params).promise();
};

const removeEmailFromProcessPool = async (emailId) => {
  const params = {
    TableName: processPoolTable,
    Key: {
      emailId
    }
  };
  await docClient.delete(params).promise();
};

const increaseEmailCount = async () => {
  const params = {
    TableName: itemCountOfTable,
    Key: {
      tableId: emailPoolTable
    },
    UpdateExpression: 'set countOfItem = if_not_exists(countOfItem, :start) + :inc',
    ExpressionAttributeValues: {
      ':inc': 1,
      ':start': 0
    }
  };
  await docClient.update(params).promise();
};

const decreaseEmailCount = async () => {
  const params = {
    TableName: itemCountOfTable,
    Key: {
      tableId: emailPoolTable
    },
    UpdateExpression: 'set countOfItem = if_not_exists(countOfItem, :start) - :inc',
    ExpressionAttributeValues: {
      ':inc': 1,
      ':start': 1
    }
  };
  await docClient.update(params).promise();
};

const increaseProcessCount = async () => {
  const params = {
    TableName: itemCountOfTable,
    Key: {
      tableId: processPoolTable
    },
    UpdateExpression: 'set countOfItem = if_not_exists(countOfItem, :start) + :inc',
    ExpressionAttributeValues: {
      ':inc': 1,
      ':start': 0
    }
  };
  await docClient.update(params).promise();
};

const decreaseProcessCount = async () => {
  const params = {
    TableName: itemCountOfTable,
    Key: {
      tableId: processPoolTable
    },
    UpdateExpression: 'set countOfItem = if_not_exists(countOfItem, :start) - :inc',
    ExpressionAttributeValues: {
      ':inc': 1,
      ':start': 1
    }
  };
  await docClient.update(params).promise();
};

const getNumberOfItem = async (tableName) => {
  const params = {
    TableName: itemCountOfTable,
    Key: { tableId: tableName }
  };
  const { Item } = await docClient.get(params).promise();
  return Item.countOfItem;
};

const formatDate = (data) => {
  // change timestamp to date
  let ret = data;
  for (let i = 0; i < ret.length; i++) {
    if (ret[i].createdAt) {
      const t = new Date(ret[i].createdAt);
      ret[i].createdAt = t.toDateString();
    }
    if (ret[i].startedAt) {
      const t = new Date(ret[i].startedAt);
      ret[i].startedAt = t.toDateString();
    }
  }
  return ret;
}

module.exports = {
  addEmailToEmailTable,
  addEmailToProcessTable,
  getTableData,
  updateEmailInPool,
  assignEmailToUser,
  unassignEmailFromUser,
  unassignAllEmailsFromUser,
  removeEmailFromProcessPool,
  getOldestEmailFromProcessPool,
  increaseEmailCount,
  decreaseEmailCount,
  increaseProcessCount,
  decreaseProcessCount,
  getNumberOfItem,
  formatDate
};
