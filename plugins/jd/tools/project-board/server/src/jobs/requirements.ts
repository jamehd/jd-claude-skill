import { createRequire } from 'node:module'
import { findShared } from '../project-config.js'
import type * as Shared from '../../../../../shared/requirements.mjs'

export type { Requirement, RequirementsLayout } from '../../../../../shared/requirements.mjs'

const shared = createRequire(import.meta.url)(findShared('requirements.mjs')) as typeof Shared

export const { extractReqIds, parseRequirementDoc, parseRequirementsDir } = shared
