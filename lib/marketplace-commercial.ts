import type {
  Classification,
  Group,
  MarketplaceChannel,
  MarketplaceCommercialProfile,
  MarketplaceCommissionRule,
  MarketplaceReviewStatus,
  MarketplaceRuleSourceType,
  MarketplaceRuleType,
  MarketplaceScopedGroup,
  Product,
} from '@/types'

function buildRuleId(channelId: string, groupId: string): string {
  return `${channelId}::${groupId}`
}

function toScopedGroup(group: Group): MarketplaceScopedGroup {
  return {
    id: group.id,
    name: group.name,
    categoryLabel: group.levelLabel,
  }
}

export function getClassificationScopedGroups(
  classifications: Classification[],
  groups: Group[]
): MarketplaceScopedGroup[] {
  if (classifications.length === 0 || groups.length === 0) return []

  const scopedProductIds = new Set(
    classifications.flatMap((classification) => classification.productIds)
  )

  return groups
    .filter((group) => group.productIds.some((productId) => scopedProductIds.has(productId)))
    .map(toScopedGroup)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

function buildRuleFromMarketplaceBase(
  marketplace: MarketplaceChannel,
  group: MarketplaceScopedGroup
): MarketplaceCommissionRule {
  return {
    id: buildRuleId(marketplace.id, group.id),
    channelId: marketplace.id,
    groupId: group.id,
    groupName: group.name,
    categoryLabel: group.categoryLabel,
    ruleType: 'base',
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

export function syncCommissionRulesToScope(
  marketplaces: MarketplaceChannel[],
  scopedGroups: MarketplaceScopedGroup[],
  existingRules: MarketplaceCommissionRule[]
): MarketplaceCommissionRule[] {
  if (scopedGroups.length === 0) return []

  const scopedKeys = new Set(scopedGroups.map((group) => group.id))
  const rulesById = new Map(existingRules.map((rule) => [rule.id, rule]))
  const nextRules: MarketplaceCommissionRule[] = []

  for (const marketplace of marketplaces) {
    for (const group of scopedGroups) {
      const ruleId = buildRuleId(marketplace.id, group.id)
      const existingRule = rulesById.get(ruleId)

      if (existingRule) {
        nextRules.push({
          ...existingRule,
          groupName: group.name,
          categoryLabel: group.categoryLabel,
        })
        continue
      }

      nextRules.push(buildRuleFromMarketplaceBase(marketplace, group))
    }
  }

  return nextRules.filter((rule) => scopedKeys.has(rule.groupId))
}

function findRuleByFallbackNames(
  product: Product,
  marketplaceId: string,
  rules: MarketplaceCommissionRule[]
): MarketplaceCommissionRule | undefined {
  const candidates = [product.primaryTaxonomyGroupName, product.category]
    .filter(Boolean)
    .map((value) => value!.trim().toLowerCase())

  if (candidates.length === 0) return undefined

  return rules.find(
    (rule) =>
      rule.channelId === marketplaceId &&
      candidates.includes(rule.groupName.trim().toLowerCase())
  )
}

export function resolveMarketplaceCommissionRule(
  product: Product,
  marketplace: MarketplaceChannel,
  rules: MarketplaceCommissionRule[]
): MarketplaceCommissionRule {
  const scopedRule =
    (product.primaryTaxonomyNodeId
      ? rules.find(
          (rule) =>
            rule.channelId === marketplace.id &&
            rule.groupId === product.primaryTaxonomyNodeId
        )
      : undefined) ?? findRuleByFallbackNames(product, marketplace.id, rules)

  if (scopedRule) return scopedRule

  return {
    id: buildRuleId(marketplace.id, product.primaryTaxonomyNodeId ?? 'base'),
    channelId: marketplace.id,
    groupId: product.primaryTaxonomyNodeId ?? 'base',
    groupName:
      product.primaryTaxonomyGroupName ??
      product.category ??
      'Sem grupo',
    categoryLabel: 'Base',
    ruleType: 'base',
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

export function resolveCommercialTerms(
  product: Product,
  marketplace: MarketplaceChannel,
  rules: MarketplaceCommissionRule[]
): MarketplaceCommercialProfile & {
  ruleType: MarketplaceRuleType
  sourceType: MarketplaceRuleSourceType
  reviewStatus: MarketplaceReviewStatus
  groupId?: string
  groupName?: string
} {
  const rule = resolveMarketplaceCommissionRule(product, marketplace, rules)

  return {
    commissionPercent: rule.ruleType === 'group_override'
      ? rule.commissionPercent
      : marketplace.commercialProfile.commissionPercent,
    fixedFeeAmount: rule.ruleType === 'group_override'
      ? rule.fixedFeeAmount
      : marketplace.commercialProfile.fixedFeeAmount,
    freightFixedAmount: rule.ruleType === 'group_override'
      ? rule.freightFixedAmount
      : marketplace.commercialProfile.freightFixedAmount,
    sourceType: rule.sourceType,
    sourceRef: rule.sourceRef,
    evidenceDate: rule.evidenceDate,
    reviewStatus: rule.reviewStatus,
    notes: rule.notes,
    ruleType: rule.ruleType,
    groupId: rule.groupId,
    groupName: rule.groupName,
  }
}

export function getMarketplaceCompleteness(
  marketplaceId: string,
  scopedGroups: MarketplaceScopedGroup[],
  rules: MarketplaceCommissionRule[]
): {
  total: number
  validated: number
  manualAssumption: number
  missing: number
} {
  const scopedRuleIds = new Set(scopedGroups.map((group) => buildRuleId(marketplaceId, group.id)))
  const filteredRules = rules.filter((rule) => scopedRuleIds.has(rule.id))

  let validated = 0
  let manualAssumption = 0
  let missing = 0

  for (const rule of filteredRules) {
    if (rule.reviewStatus === 'validated') {
      validated++
      continue
    }
    if (rule.reviewStatus === 'manual_assumption') {
      manualAssumption++
      continue
    }
    missing++
  }

  return {
    total: scopedGroups.length,
    validated,
    manualAssumption,
    missing,
  }
}

export function getMarketplaceScopedRules(
  marketplaceId: string,
  scopedGroups: MarketplaceScopedGroup[],
  rules: MarketplaceCommissionRule[]
): MarketplaceCommissionRule[] {
  const scopedRuleIds = new Set(scopedGroups.map((group) => buildRuleId(marketplaceId, group.id)))

  return rules
    .filter((rule) => scopedRuleIds.has(rule.id))
    .sort((a, b) => a.groupName.localeCompare(b.groupName, 'pt-BR'))
}

export function getCommercialReviewColor(reviewStatus: MarketplaceReviewStatus): string {
  switch (reviewStatus) {
    case 'validated':
      return 'var(--accent-success)'
    case 'manual_assumption':
      return 'var(--accent-warning)'
    default:
      return 'var(--accent-danger)'
  }
}
