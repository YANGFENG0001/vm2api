import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { VIEW_TITLES } from '@/config/nav'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/page-header'
import { SectionSkeleton } from '@/components/page-skeletons'
import { QueryGate } from '@/components/query-gate'
import { dashboardQueryOptions } from '@/features/overview/queries'
import { CredentialFlow } from './credential-flow'
import { VmPackageImportCard } from './vm-package-card'

export function ImportPage() {
  const dash = useQuery(dashboardQueryOptions())
  const [tab, setTab] = useState('create')
  return (
    <PageHeader title={VIEW_TITLES.import}>
      <Tabs value={tab} onValueChange={setTab} className='max-w-2xl gap-4'>
        <TabsList>
          <TabsTrigger value='create'>创建vm</TabsTrigger>
          <TabsTrigger value='import'>导入vm</TabsTrigger>
        </TabsList>
        <TabsContent value='create'>
          <QueryGate
            loading={dash.isLoading}
            error={dash.error}
            skeleton={
              <SectionSkeleton
                titleWidth='w-28'
                showDescription={false}
                rows={8}
              />
            }
          >
            <CredentialFlow />
          </QueryGate>
        </TabsContent>
        <TabsContent value='import'>
          <VmPackageImportCard />
        </TabsContent>
      </Tabs>
    </PageHeader>
  )
}
