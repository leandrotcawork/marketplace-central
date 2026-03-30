'use client'

import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { sqliteStorage } from '@/lib/sqlite-storage'
import { syncCommissionRulesToScope } from '@/lib/marketplace-commercial'
import { getDefaultMarketplaces } from '@/lib/marketplace-seed'
import { generateId } from '@/lib/formatters'
import type {
  Marketplace,
  MarketplaceCapabilityProfile,
  MarketplaceCommercialProfile,
  MarketplaceCommissionImportGroupPreview,
  MarketplaceCommissionImportProductPreview,
  MarketplaceCommissionRule,
  MarketplaceConnection,
  MarketplaceProductImportOverride,
  MarketplaceShippingPolicy,
  MarketplaceScopedGroup,
} from '@/types'

function buildCustomMarketplace(name: string): Marketplace {
  const id = generateId()
  return {
    id,
    name,
    active: false,
    rolloutStage: 'blocked',
    executionMode: 'blocked',
    authStrategy: 'unknown',
    connectionStatus: 'disconnected',
    notes: 'Canal customizado. Defina capabilities, conexão e regras comerciais antes de usar.',
    capabilities: {
      publish: 'planned',
      priceSync: 'planned',
      stockSync: 'planned',
      orders: 'planned',
      messages: 'planned',
      questions: 'planned',
      freightQuotes: 'planned',
      webhooks: 'planned',
      sandbox: 'planned',
    },
    commercialProfile: {
      commissionPercent: 0,
      fixedFeeAmount: 0,
      freightFixedAmount: 0,
      sourceType: 'manual_assumption',
      sourceRef: 'Canal customizado',
      reviewStatus: 'missing',
      notes: 'Preencha as regras comerciais manualmente.',
    },
  }
}

interface LegacyMarketplaceState {
  marketplaces?: Array<{
    id: string
    name: string
    commission?: number
    fixedFee?: number
    active?: boolean
    notes?: string
  }>
}

interface MarketplaceState {
  marketplaces: Marketplace[]
  commissionRules: MarketplaceCommissionRule[]
  // productId → override, keyed by channelId
  productImportOverrides: Record<string, Record<string, MarketplaceProductImportOverride>>
  selectedMarketplaceId: string | null
  setSelectedMarketplace: (id: string | null) => void
  toggleActive: (id: string) => void
  updateMarketplace: (id: string, partial: Partial<Marketplace>) => void
  updateMarketplaceCommercialProfile: (
    id: string,
    partial: Partial<MarketplaceCommercialProfile>
  ) => void
  updateShippingPolicy: (
    channelId: string,
    policy: MarketplaceShippingPolicy | undefined
  ) => void
  updateMarketplaceCapabilities: (
    id: string,
    partial: Partial<MarketplaceCapabilityProfile>
  ) => void
  syncConnectionStatuses: (connections: MarketplaceConnection[]) => void
  syncCommissionScope: (scopedGroups: MarketplaceScopedGroup[]) => void
  updateCommissionRule: (id: string, partial: Partial<MarketplaceCommissionRule>) => void
  applyCommissionImport: (
    channelId: string,
    groups: MarketplaceCommissionImportGroupPreview[]
  ) => void
  applyProductCommissionImport: (
    channelId: string,
    previews: MarketplaceCommissionImportProductPreview[]
  ) => void
  addMarketplace: (name: string) => void
  removeMarketplace: (id: string) => void
  resetDefaults: () => void
}

export const useMarketplaceStore = create<MarketplaceState>()(
  persist(
    (set) => ({
      marketplaces: getDefaultMarketplaces(),
      commissionRules: [],
      productImportOverrides: {},
      selectedMarketplaceId: getDefaultMarketplaces()[0]?.id ?? null,

      setSelectedMarketplace: (id) => set({ selectedMarketplaceId: id }),

      toggleActive: (id) =>
        set((state) => ({
          marketplaces: state.marketplaces.map((marketplace) =>
            marketplace.id === id
              ? { ...marketplace, active: !marketplace.active }
              : marketplace
          ),
        })),

      updateMarketplace: (id, partial) =>
        set((state) => ({
          marketplaces: state.marketplaces.map((marketplace) =>
            marketplace.id === id ? { ...marketplace, ...partial } : marketplace
          ),
        })),

      updateMarketplaceCommercialProfile: (id, partial) =>
        set((state) => ({
          marketplaces: state.marketplaces.map((marketplace) => {
            if (marketplace.id !== id) return marketplace
            return {
              ...marketplace,
              commercialProfile: {
                ...marketplace.commercialProfile,
                ...partial,
              },
            }
          }),
          commissionRules: state.commissionRules.map((rule) => {
            if (rule.channelId !== id || rule.ruleType !== 'base') return rule

            const marketplace = state.marketplaces.find((candidate) => candidate.id === id)
            const nextCommercialProfile = {
              ...(marketplace?.commercialProfile ?? {
                commissionPercent: 0,
                fixedFeeAmount: 0,
                freightFixedAmount: 0,
                sourceType: 'manual_assumption',
                reviewStatus: 'manual_assumption',
              }),
              ...partial,
            }

            return {
              ...rule,
              commissionPercent: nextCommercialProfile.commissionPercent,
              fixedFeeAmount: nextCommercialProfile.fixedFeeAmount,
              freightFixedAmount: nextCommercialProfile.freightFixedAmount,
              sourceType: nextCommercialProfile.sourceType,
              sourceRef: nextCommercialProfile.sourceRef,
              evidenceDate: nextCommercialProfile.evidenceDate,
              reviewStatus: nextCommercialProfile.reviewStatus,
              notes: nextCommercialProfile.notes,
            }
          }),
        })),

      updateShippingPolicy: (channelId, policy) =>
        set((state) => ({
          marketplaces: state.marketplaces.map((marketplace) =>
            marketplace.id === channelId
              ? { ...marketplace, shippingPolicy: policy }
              : marketplace
          ),
        })),

      updateMarketplaceCapabilities: (id, partial) =>
        set((state) => ({
          marketplaces: state.marketplaces.map((marketplace) =>
            marketplace.id === id
              ? {
                  ...marketplace,
                  capabilities: {
                    ...marketplace.capabilities,
                    ...partial,
                  },
                }
              : marketplace
          ),
        })),

      syncConnectionStatuses: (connections) =>
        set((state) => ({
          marketplaces: state.marketplaces.map((marketplace) => {
            const connection = connections.find(
              (candidate) => candidate.channelId === marketplace.id
            )
            return connection
              ? {
                  ...marketplace,
                  connectionStatus: connection.status,
                }
              : marketplace
          }),
        })),

      syncCommissionScope: (scopedGroups) =>
        set((state) => ({
          commissionRules: syncCommissionRulesToScope(
            state.marketplaces,
            scopedGroups,
            state.commissionRules
          ),
        })),

      updateCommissionRule: (id, partial) =>
        set((state) => ({
          commissionRules: state.commissionRules.map((rule) => {
            if (rule.id !== id) return rule

            const nextRule = { ...rule, ...partial }

            const hasNumericEdit =
              'commissionPercent' in partial ||
              'fixedFeeAmount' in partial ||
              'freightFixedAmount' in partial

            if (nextRule.ruleType === 'base' && hasNumericEdit) {
              return { ...nextRule, ruleType: 'group_override' as const }
            }

            if (nextRule.ruleType === 'base') {
              const marketplace = state.marketplaces.find(
                (candidate) => candidate.id === nextRule.channelId
              )

              if (!marketplace) return nextRule

              return {
                ...nextRule,
                commissionPercent: marketplace.commercialProfile.commissionPercent,
                fixedFeeAmount: marketplace.commercialProfile.fixedFeeAmount,
                freightFixedAmount: marketplace.commercialProfile.freightFixedAmount,
                sourceType: marketplace.commercialProfile.sourceType,
                sourceRef: marketplace.commercialProfile.sourceRef,
                evidenceDate: marketplace.commercialProfile.evidenceDate,
                reviewStatus: marketplace.commercialProfile.reviewStatus,
                notes: marketplace.commercialProfile.notes,
              }
            }

            return nextRule
          }),
        })),

      applyCommissionImport: (channelId, groups) =>
        set((state) => {
          const importedGroups = new Map(
            groups
              .filter(
                (group) =>
                  group.status === 'importable' &&
                  typeof group.commissionPercent === 'number' &&
                  typeof group.fixedFeeAmount === 'number'
              )
              .map((group) => [group.groupId, group] as const)
          )

          if (importedGroups.size === 0) {
            return state
          }

          const now = new Date().toISOString()
          const matchedGroupIds = new Set<string>()

          // Update existing rules
          const updatedRules = state.commissionRules.map((rule) => {
            if (rule.channelId !== channelId) return rule

            const imported = importedGroups.get(rule.groupId)
            if (!imported) return rule

            matchedGroupIds.add(rule.groupId)

            return {
              ...rule,
              ruleType: 'group_override' as const,
              commissionPercent: imported.commissionPercent ?? rule.commissionPercent,
              fixedFeeAmount: imported.fixedFeeAmount ?? rule.fixedFeeAmount,
              freightFixedAmount: imported.freightFixedAmount ?? rule.freightFixedAmount,
              listingTypeId: imported.listingTypeId,
              sourceType: 'official_doc' as const,
              sourceRef: imported.sourceRef,
              evidenceDate: now,
              reviewStatus: 'validated' as const,
              notes: imported.notes,
            }
          })

          // Upsert: create rules for groups that had no existing rule
          const newRules: MarketplaceCommissionRule[] = []
          for (const [groupId, imported] of importedGroups) {
            if (matchedGroupIds.has(groupId)) continue
            newRules.push({
              id: `${channelId}::${groupId}`,
              channelId,
              groupId,
              groupName: imported.groupName,
              categoryLabel: imported.categoryLabel,
              ruleType: 'group_override',
              commissionPercent: imported.commissionPercent ?? 0,
              fixedFeeAmount: imported.fixedFeeAmount ?? 0,
              freightFixedAmount: imported.freightFixedAmount ?? 0,
              listingTypeId: imported.listingTypeId,
              sourceType: 'official_doc',
              sourceRef: imported.sourceRef,
              evidenceDate: now,
              reviewStatus: 'validated',
              notes: imported.notes,
            })
          }

          return { commissionRules: [...updatedRules, ...newRules] }
        }),

      applyProductCommissionImport: (channelId, previews) =>
        set((state) => {
          const channelOverrides: Record<string, MarketplaceProductImportOverride> = {}
          const importedAt = new Date().toISOString()
          for (const preview of previews) {
            channelOverrides[preview.productId] = {
              channelId,
              productId: preview.productId,
              status: preview.status,
              categoryId: preview.categoryId,
              listingTypeId: preview.listingTypeId,
              commissionPercent: preview.commissionPercent,
              fixedFeeAmount: preview.fixedFeeAmount,
              freightFixedAmount: preview.freightFixedAmount,
              importedAt,
            }
          }
          return {
            productImportOverrides: {
              ...state.productImportOverrides,
              [channelId]: channelOverrides,
            },
          }
        }),

      addMarketplace: (name) =>
        set((state) => {
          const nextMarketplace = buildCustomMarketplace(name)
          return {
            marketplaces: [...state.marketplaces, nextMarketplace],
            selectedMarketplaceId: nextMarketplace.id,
          }
        }),

      removeMarketplace: (id) =>
        set((state) => ({
          marketplaces: state.marketplaces.filter((marketplace) => marketplace.id !== id),
          commissionRules: state.commissionRules.filter((rule) => rule.channelId !== id),
          selectedMarketplaceId:
            state.selectedMarketplaceId === id
              ? state.marketplaces.find((marketplace) => marketplace.id !== id)?.id ?? null
              : state.selectedMarketplaceId,
        })),

      resetDefaults: () =>
        set({
          marketplaces: getDefaultMarketplaces(),
          commissionRules: [],
          productImportOverrides: {},
          selectedMarketplaceId: getDefaultMarketplaces()[0]?.id ?? null,
        }),
    }),
    {
      name: 'mc-marketplaces',
      storage: createJSONStorage(() => sqliteStorage),
      version: 3,
      migrate: (persistedState: unknown, version) => {
        if (!persistedState || typeof persistedState !== 'object') {
          return {
            marketplaces: getDefaultMarketplaces(),
            commissionRules: [],
            productImportOverrides: {},
            selectedMarketplaceId: getDefaultMarketplaces()[0]?.id ?? null,
          }
        }

        if (version >= 3) {
          return persistedState as MarketplaceState
        }

        if (version >= 2) {
          return {
            ...(persistedState as MarketplaceState),
            productImportOverrides: {},
          }
        }

        const legacy = persistedState as LegacyMarketplaceState
        const defaults = getDefaultMarketplaces()
        const mergedMarketplaces = defaults.map((marketplace) => {
          const legacyMarketplace = legacy.marketplaces?.find((candidate) => candidate.id === marketplace.id)
          if (!legacyMarketplace) return marketplace

          const mergedCommercialProfile = {
            ...marketplace.commercialProfile,
            commissionPercent: legacyMarketplace.commission ?? marketplace.commercialProfile.commissionPercent,
            fixedFeeAmount: legacyMarketplace.fixedFee ?? marketplace.commercialProfile.fixedFeeAmount,
            notes: legacyMarketplace.notes ?? marketplace.commercialProfile.notes,
          }

          return {
            ...marketplace,
            active: legacyMarketplace.active ?? marketplace.active,
            notes: legacyMarketplace.notes ?? marketplace.notes,
            commercialProfile: mergedCommercialProfile,
          }
        })

        return {
          marketplaces: mergedMarketplaces,
          commissionRules: [],
          productImportOverrides: {},
          selectedMarketplaceId: mergedMarketplaces[0]?.id ?? null,
        }
      },
    }
  )
)
