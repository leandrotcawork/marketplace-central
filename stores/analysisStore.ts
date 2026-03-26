'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CompetitorPrice, AIAnalysis, Publication } from '@/types'

interface AnalysisState {
  competitorPrices: CompetitorPrice[]
  aiAnalyses: AIAnalysis[]
  publications: Publication[]
  setCompetitorData: (data: CompetitorPrice[]) => void
  addAnalysis: (analysis: AIAnalysis) => void
  updateAnalysis: (productId: string, partial: Partial<AIAnalysis>) => void
  addPublication: (publication: Publication) => void
  upsertPublication: (publication: Publication) => void
  upsertPublications: (publications: Publication[]) => void
  updatePublication: (id: string, partial: Partial<Publication>) => void
  updatePublicationStatus: (
    id: string,
    status: Publication['status'],
    publishedAt?: string,
    syncedAt?: string,
    errorMessage?: string
  ) => void
}

export const useAnalysisStore = create<AnalysisState>()(
  persist(
    (set) => ({
      competitorPrices: [],
      aiAnalyses: [],
      publications: [],

      setCompetitorData: (data) =>
        set(() => ({
          competitorPrices: data,
        })),

      addAnalysis: (analysis) =>
        set((state) => {
          const existing = state.aiAnalyses.findIndex(
            (candidate) => candidate.productId === analysis.productId
          )

          if (existing >= 0) {
            const updated = [...state.aiAnalyses]
            updated[existing] = analysis
            return { aiAnalyses: updated }
          }

          return { aiAnalyses: [...state.aiAnalyses, analysis] }
        }),

      updateAnalysis: (productId, partial) =>
        set((state) => ({
          aiAnalyses: state.aiAnalyses.map((analysis) =>
            analysis.productId === productId ? { ...analysis, ...partial } : analysis
          ),
        })),

      addPublication: (publication) =>
        set((state) => ({
          publications: [...state.publications, publication],
        })),

      upsertPublication: (publication) =>
        set((state) => {
          const existing = state.publications.findIndex(
            (candidate) => candidate.id === publication.id
          )

          if (existing >= 0) {
            const updated = [...state.publications]
            updated[existing] = publication
            return { publications: updated }
          }

          return { publications: [...state.publications, publication] }
        }),

      upsertPublications: (publications) =>
        set((state) => {
          const publicationMap = new Map(
            state.publications.map((publication) => [publication.id, publication])
          )

          for (const publication of publications) {
            publicationMap.set(publication.id, publication)
          }

          return {
            publications: Array.from(publicationMap.values()),
          }
        }),

      updatePublication: (id, partial) =>
        set((state) => ({
          publications: state.publications.map((publication) =>
            publication.id === id ? { ...publication, ...partial } : publication
          ),
        })),

      updatePublicationStatus: (id, status, publishedAt, syncedAt, errorMessage) =>
        set((state) => ({
          publications: state.publications.map((publication) =>
            publication.id === id
              ? {
                  ...publication,
                  status,
                  ...(publishedAt ? { publishedAt } : {}),
                  ...(syncedAt ? { syncedAt } : {}),
                  ...(errorMessage ? { errorMessage } : {}),
                }
              : publication
          ),
        })),
    }),
    {
      name: 'mc-analysis',
      version: 2,
      migrate: (persistedState: unknown, version) => {
        if (!persistedState || typeof persistedState !== 'object') {
          return {
            competitorPrices: [],
            aiAnalyses: [],
            publications: [],
          }
        }

        if (version >= 2) {
          return persistedState as AnalysisState
        }

        const legacy = persistedState as {
          competitorPrices?: CompetitorPrice[]
          aiAnalyses?: AIAnalysis[]
          publications?: Array<
            Omit<Partial<Publication>, 'status'> & {
              status?: 'draft' | 'ready' | 'published'
            }
          >
        }

        return {
          competitorPrices: legacy.competitorPrices ?? [],
          aiAnalyses: legacy.aiAnalyses ?? [],
          publications:
            legacy.publications?.map((publication) => ({
              ...publication,
              status:
                publication.status === 'ready'
                  ? 'queued'
                  : publication.status ?? 'draft',
              commissionPercent: publication.commissionPercent ?? 0,
              fixedFeeAmount: publication.fixedFeeAmount ?? 0,
              freightFixedAmount: publication.freightFixedAmount ?? 0,
              totalFees: publication.totalFees ?? 0,
              ruleType: publication.ruleType ?? 'base',
              reviewStatus: publication.reviewStatus ?? 'manual_assumption',
              sourceType: publication.sourceType ?? 'manual_assumption',
            })) ?? [],
        }
      },
    }
  )
)
