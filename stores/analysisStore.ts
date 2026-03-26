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
  updatePublicationStatus: (id: string, status: Publication['status'], publishedAt?: string) => void
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
            (a) => a.productId === analysis.productId
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
          aiAnalyses: state.aiAnalyses.map((a) =>
            a.productId === productId ? { ...a, ...partial } : a
          ),
        })),

      addPublication: (publication) =>
        set((state) => ({
          publications: [...state.publications, publication],
        })),

      updatePublicationStatus: (id, status, publishedAt) =>
        set((state) => ({
          publications: state.publications.map((p) =>
            p.id === id
              ? { ...p, status, ...(publishedAt ? { publishedAt } : {}) }
              : p
          ),
        })),
    }),
    {
      name: 'mc-analysis',
    }
  )
)
