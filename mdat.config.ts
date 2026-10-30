import { mdatConfig } from '@kitschpatrol/mdat-config'
import { repositoryColumns } from './src/lib/column-variables.js'

export default mdatConfig({
	'column-count': () => String(repositoryColumns.length),
})
