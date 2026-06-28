import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { BedrockAgentCoreClient } from '@aws-sdk/client-bedrock-agentcore';
import { AwsCredentialIdentity } from '@aws-sdk/types';
import { RuntimeConfig } from '../config';

export function createDynamoClient(config: RuntimeConfig, credentials: AwsCredentialIdentity) {
  const client = new DynamoDBClient({ region: config.region, credentials });
  return DynamoDBDocumentClient.from(client);
}

export function createAgentCoreClient(config: RuntimeConfig, credentials: AwsCredentialIdentity) {
  return new BedrockAgentCoreClient({ region: config.region, credentials });
}
