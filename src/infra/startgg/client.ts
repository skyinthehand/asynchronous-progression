import { GraphQLClient } from "graphql-request";

export const STARTGG_GRAPHQL_ENDPOINT = "https://api.start.gg/gql/alpha";

/**
 * Creates a startgg GraphQL client authenticated with the given Personal
 * Access Token. A new client is created per call since the token can change
 * independently of the rest of the app's lifetime (FR-028).
 */
export function createStartggClient(token: string): GraphQLClient {
  return new GraphQLClient(STARTGG_GRAPHQL_ENDPOINT, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}
