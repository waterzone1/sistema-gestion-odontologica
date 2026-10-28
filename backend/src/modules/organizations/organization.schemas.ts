import { z } from 'zod'

export const organizationModulesSchema = z
  .object({ coverages: z.boolean().meta({ description: 'Coberturas, convenios y liquidaciones a obras sociales y prepagas' }) })
  .meta({ id: 'OrganizationModules' })

export type OrganizationModules = z.infer<typeof organizationModulesSchema>
