import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

export const CURRENT_TERMS_VERSION = 'v1.0';

export interface ConsentRecord {
  acceptedVersion: string;
  acceptedAt: string;
}

export async function getConsent(client: DynamoDBDocumentClient, table: string, sub: string): Promise<ConsentRecord | null> {
  const result = await client.send(new GetCommand({
    TableName: table,
    Key: { PK: `USER#${sub}#CONSENT` },
  }));
  if (!result.Item) return null;
  return { acceptedVersion: result.Item.acceptedVersion, acceptedAt: result.Item.acceptedAt };
}

export async function saveConsent(client: DynamoDBDocumentClient, table: string, sub: string): Promise<void> {
  await client.send(new PutCommand({
    TableName: table,
    Item: {
      PK: `USER#${sub}#CONSENT`,
      acceptedVersion: CURRENT_TERMS_VERSION,
      acceptedAt: new Date().toISOString(),
    },
  }));
}
