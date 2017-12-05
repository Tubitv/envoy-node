import fetch, { RequestInit, Response } from 'node-fetch'
import { parse as parseUrl } from 'url'

import EnvoyContext from './envoy-context'

export default async function envoyFetch(
  envoyContext: EnvoyContext,
  url: string,
  init?: RequestInit
): Promise<Response> {
  const { protocol, host, hostname, path } = parseUrl(url)
  if (protocol !== 'http:') {
    throw new Error('envoy fetch is designed only for http for now')
  }
  const refinedInit = Object.assign({}, init)
  refinedInit.headers = Object.assign(
    {},
    refinedInit.headers,
    envoyContext.assembleHeader(),
    {
      // we are likely to assign host (hostname + port) here
      // but envoy has a bug, if you specify a port number, it returns 404
      host: hostname
    }
  )
  return await fetch(
    `http://127.0.0.1:${envoyContext.envoyEgressPort}${path}`,
    refinedInit
  )
}
