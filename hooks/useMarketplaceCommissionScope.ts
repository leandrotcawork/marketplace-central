'use client'

import { useEffect, useMemo } from 'react'
import { getClassificationScopedGroups } from '@/lib/marketplace-commercial'
import { useClassificationStore } from '@/stores/classificationStore'
import { useGroupStore } from '@/stores/groupStore'
import { useMarketplaceStore } from '@/stores/marketplaceStore'

export function useMarketplaceCommissionScope() {
  const classifications = useClassificationStore((state) => state.classifications)
  const groups = useGroupStore((state) => state.groups)
  const isLoading = useGroupStore((state) => state.isLoading)
  const error = useGroupStore((state) => state.error)
  const fetchFromMetalShopping = useGroupStore((state) => state.fetchFromMetalShopping)
  const syncCommissionScope = useMarketplaceStore((state) => state.syncCommissionScope)

  const scopedGroups = useMemo(
    () => getClassificationScopedGroups(classifications, groups),
    [classifications, groups]
  )

  useEffect(() => {
    if (classifications.length === 0) return
    if (groups.length > 0 || isLoading) return

    void fetchFromMetalShopping()
  }, [classifications.length, fetchFromMetalShopping, groups.length, isLoading])

  useEffect(() => {
    syncCommissionScope(scopedGroups)
  }, [scopedGroups, syncCommissionScope])

  return {
    classifications,
    groups,
    scopedGroups,
    groupsLoading: isLoading,
    groupsError: error,
  }
}
