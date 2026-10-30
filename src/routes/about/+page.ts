import type { PageLoad } from './$types'

export const load: PageLoad = ({ url }) => ({ version: url.searchParams.get('version') ?? '' })
