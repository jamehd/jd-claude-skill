export interface Requirement {
  id: string
  title: string
  statement: string
  acceptance: string[]
  removed?: boolean
}

export interface RequirementsLayout {
  dir?: string
  subdirs?: string[]
  id_pattern?: string
}

export function extractReqIds(text: string, idRegex?: RegExp): string[]
export function parseRequirementDoc(markdown: string, idRegex?: RegExp): Requirement[]
export function parseRequirementsDir(repoRoot: string, cfg?: RequirementsLayout): Map<string, Requirement>
