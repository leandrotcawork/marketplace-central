'use client'

import { useState, useRef, useCallback } from 'react'
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { parseXLSX } from '@/lib/xlsx-parser'
import { useProductStore } from '@/stores/productStore'
import type { Product } from '@/types'

interface FileUploadProps {
  onImported?: (count: number) => void
}

export function FileUpload({ onImported }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [status, setStatus] = useState<'idle' | 'parsing' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [importedCount, setImportedCount] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const { importFromXLSX, products } = useProductStore()

  const processFile = useCallback(async (file: File) => {
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      setStatus('error')
      setMessage('Formato inválido. Use arquivos .xlsx ou .xls')
      return
    }

    setStatus('parsing')
    setMessage('Processando arquivo...')

    try {
      const buffer = await file.arrayBuffer()
      const parsed: Product[] = parseXLSX(buffer)

      if (parsed.length === 0) {
        setStatus('error')
        setMessage('Nenhum produto válido encontrado. Verifique o formato do arquivo.')
        return
      }

      importFromXLSX(parsed)
      setImportedCount(parsed.length)
      setStatus('success')
      setMessage(`${parsed.length} produto${parsed.length > 1 ? 's' : ''} importado${parsed.length > 1 ? 's' : ''} com sucesso`)
      onImported?.(parsed.length)
    } catch {
      setStatus('error')
      setMessage('Erro ao processar o arquivo. Verifique se está no formato correto.')
    }
  }, [importFromXLSX, onImported])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }, [processFile])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
    e.target.value = ''
  }

  const reset = () => {
    setStatus('idle')
    setMessage('')
  }

  if (products.length > 0 && status !== 'error') {
    return (
      <div
        className="flex items-center justify-between rounded-lg border px-4 py-3"
        style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}
      >
        <div className="flex items-center gap-3">
          <FileSpreadsheet size={18} style={{ color: 'var(--accent-success)' }} />
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-dm-sans)' }}>
              Catálogo carregado
            </p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-jetbrains-mono)' }}>
              {products.length} produto{products.length > 1 ? 's' : ''} no catálogo
            </p>
          </div>
        </div>
        <button
          onClick={() => inputRef.current?.click()}
          className="text-xs px-3 py-1.5 rounded transition-colors"
          style={{ color: 'var(--accent-primary)', border: '1px solid var(--border-color)' }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)' }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '' }}
        >
          Reimportar
        </button>
        <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileChange} />
      </div>
    )
  }

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
        className={cn(
          'relative rounded-lg border-2 border-dashed cursor-pointer transition-all duration-200',
          'flex flex-col items-center justify-center gap-3 py-12',
          isDragging && 'scale-[1.01]',
        )}
        style={{
          borderColor: isDragging ? 'var(--accent-primary)' : 'var(--border-color)',
          backgroundColor: isDragging ? 'rgba(59,130,246,0.05)' : 'var(--bg-secondary)',
        }}
      >
        <div
          className="w-14 h-14 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)' }}
        >
          {status === 'parsing' ? (
            <div className="w-6 h-6 rounded-full border-2 border-transparent animate-spin"
              style={{ borderTopColor: 'var(--accent-primary)' }} />
          ) : status === 'success' ? (
            <CheckCircle2 size={24} style={{ color: 'var(--accent-success)' }} />
          ) : status === 'error' ? (
            <AlertCircle size={24} style={{ color: 'var(--accent-danger)' }} />
          ) : (
            <Upload size={24} style={{ color: 'var(--text-secondary)' }} />
          )}
        </div>

        <div className="text-center space-y-1">
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-dm-sans)' }}>
            {status === 'idle' && 'Arraste o arquivo .xlsx aqui'}
            {status === 'parsing' && 'Processando...'}
            {status === 'success' && `${importedCount} produtos importados`}
            {status === 'error' && 'Erro na importação'}
          </p>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {status === 'idle' && 'ou clique para selecionar — SKU, Nome, Categoria, Custo, Preço Base, Estoque, Unidade'}
            {status === 'parsing' && 'Aguarde...'}
            {(status === 'success' || status === 'error') && message}
          </p>
        </div>

        {status === 'error' && (
          <button
            onClick={(e) => { e.stopPropagation(); reset() }}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded transition-colors mt-1"
            style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)' }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '' }}
          >
            <X size={12} />
            Tentar novamente
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  )
}
