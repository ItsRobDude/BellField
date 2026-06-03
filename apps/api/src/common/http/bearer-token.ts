/**
 * Extract the bearer token from an `Authorization` header, returning '' when it is missing
 * or not a well-formed `Bearer <token>`. Controllers pass the result to the identity-access
 * service, which treats '' as an unauthenticated session.
 */
export function getBearerToken(authorizationHeader: string | undefined): string {
  if (!authorizationHeader) {
    return '';
  }
  const [scheme, token] = authorizationHeader.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : '';
}
