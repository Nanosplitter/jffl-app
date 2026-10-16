export function authDomainForHost(configured: string | undefined, hostname: string | undefined) {
  return hostname === 'jffl.org' ? hostname : configured;
}
