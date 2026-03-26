import XLSX from 'xlsx';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const data = [
  { SKU: 'PRC-001', Referencia: 'REF-PRC-001', EAN: '7891234560001', Nome: 'Porcelanato Bianco 60x60', Categoria: 'Porcelanato', Custo: 45.00, 'Preço Base': 89.90, Estoque: 150, Unidade: 'm²' },
  { SKU: 'PRC-002', Referencia: 'REF-PRC-002', EAN: '7891234560002', Nome: 'Porcelanato Nero 80x80', Categoria: 'Porcelanato', Custo: 62.50, 'Preço Base': 129.90, Estoque: 85, Unidade: 'm²' },
  { SKU: 'PRC-003', Referencia: 'REF-PRC-003', EAN: '7891234560003', Nome: 'Porcelanato Carrara 60x120', Categoria: 'Porcelanato', Custo: 78.00, 'Preço Base': 159.90, Estoque: 60, Unidade: 'm²' },
  { SKU: 'PRC-004', Referencia: 'REF-PRC-004', EAN: '7891234560004', Nome: 'Porcelanato Cimento 60x60', Categoria: 'Porcelanato', Custo: 38.00, 'Preço Base': 74.90, Estoque: 200, Unidade: 'm²' },
  { SKU: 'PRC-005', Referencia: 'REF-PRC-005', EAN: '7891234560005', Nome: 'Porcelanato Madeira Natural 20x120', Categoria: 'Porcelanato', Custo: 55.00, 'Preço Base': 109.90, Estoque: 120, Unidade: 'm²' },
  { SKU: 'CER-001', Referencia: 'REF-CER-001', EAN: '7891234560101', Nome: 'Cerâmica Branca 30x60', Categoria: 'Cerâmica', Custo: 18.50, 'Preço Base': 39.90, Estoque: 300, Unidade: 'm²' },
  { SKU: 'CER-002', Referencia: 'REF-CER-002', EAN: '7891234560102', Nome: 'Cerâmica Subway 7.5x15', Categoria: 'Cerâmica', Custo: 22.00, 'Preço Base': 49.90, Estoque: 250, Unidade: 'm²' },
  { SKU: 'CER-003', Referencia: 'REF-CER-003', EAN: '7891234560103', Nome: 'Cerâmica Hexagonal Grafite', Categoria: 'Cerâmica', Custo: 32.00, 'Preço Base': 69.90, Estoque: 90, Unidade: 'm²' },
  { SKU: 'REV-001', Referencia: 'REF-REV-001', EAN: '7891234560201', Nome: 'Revestimento 3D Ondas Branco', Categoria: 'Revestimento', Custo: 28.00, 'Preço Base': 59.90, Estoque: 180, Unidade: 'm²' },
  { SKU: 'REV-002', Referencia: 'REF-REV-002', EAN: '7891234560202', Nome: 'Revestimento Geométrico Cinza', Categoria: 'Revestimento', Custo: 35.00, 'Preço Base': 72.90, Estoque: 110, Unidade: 'm²' },
  { SKU: 'MET-001', Referencia: 'REF-MET-001', EAN: '7891234560301', Nome: 'Torneira Monocomando Inox', Categoria: 'Metal', Custo: 85.00, 'Preço Base': 189.90, Estoque: 45, Unidade: 'un' },
  { SKU: 'MET-002', Referencia: 'REF-MET-002', EAN: '7891234560302', Nome: 'Chuveiro Quadrado 25cm Cromado', Categoria: 'Metal', Custo: 120.00, 'Preço Base': 259.90, Estoque: 30, Unidade: 'un' },
  { SKU: 'MET-003', Referencia: 'REF-MET-003', EAN: '7891234560303', Nome: 'Kit Acessórios Banheiro 5pçs Preto', Categoria: 'Metal', Custo: 65.00, 'Preço Base': 149.90, Estoque: 55, Unidade: 'kit' },
  { SKU: 'MET-004', Referencia: 'REF-MET-004', EAN: '7891234560304', Nome: 'Registro Gaveta 3/4 Cromado', Categoria: 'Metal', Custo: 42.00, 'Preço Base': 89.90, Estoque: 80, Unidade: 'un' },
  { SKU: 'LOU-001', Referencia: 'REF-LOU-001', EAN: '7891234560401', Nome: 'Vaso Sanitário Caixa Acoplada Branco', Categoria: 'Louça', Custo: 180.00, 'Preço Base': 399.90, Estoque: 25, Unidade: 'un' },
  { SKU: 'LOU-002', Referencia: 'REF-LOU-002', EAN: '7891234560402', Nome: 'Cuba de Apoio Redonda Branca', Categoria: 'Louça', Custo: 75.00, 'Preço Base': 169.90, Estoque: 40, Unidade: 'un' },
  { SKU: 'LOU-003', Referencia: 'REF-LOU-003', EAN: '7891234560403', Nome: 'Pia Cozinha Inox 120x50', Categoria: 'Louça', Custo: 220.00, 'Preço Base': 479.90, Estoque: 15, Unidade: 'un' },
  { SKU: 'ACE-001', Referencia: 'REF-ACE-001', EAN: '7891234560501', Nome: 'Ralo Linear Inox 70cm', Categoria: 'Acessório', Custo: 55.00, 'Preço Base': 119.90, Estoque: 60, Unidade: 'un' },
  { SKU: 'ACE-002', Referencia: 'REF-ACE-002', EAN: '7891234560502', Nome: 'Nicho Embutir 30x60 Branco', Categoria: 'Acessório', Custo: 35.00, 'Preço Base': 79.90, Estoque: 70, Unidade: 'un' },
  { SKU: 'REJ-001', Referencia: 'REF-REJ-001', EAN: '7891234560601', Nome: 'Rejunte Flexível Cinza Platina 1kg', Categoria: 'Rejunte', Custo: 8.50, 'Preço Base': 19.90, Estoque: 500, Unidade: 'un' },
  { SKU: 'REJ-002', Referencia: 'REF-REJ-002', EAN: '7891234560602', Nome: 'Rejunte Epóxi Branco 1kg', Categoria: 'Rejunte', Custo: 32.00, 'Preço Base': 69.90, Estoque: 150, Unidade: 'un' },
  { SKU: 'ARG-001', Referencia: 'REF-ARG-001', EAN: '7891234560701', Nome: 'Argamassa ACIII Cinza 20kg', Categoria: 'Argamassa', Custo: 22.00, 'Preço Base': 44.90, Estoque: 400, Unidade: 'un' },
  { SKU: 'ARG-002', Referencia: 'REF-ARG-002', EAN: '7891234560702', Nome: 'Argamassa Porcelanato Interno 20kg', Categoria: 'Argamassa', Custo: 28.00, 'Preço Base': 54.90, Estoque: 350, Unidade: 'un' },
  { SKU: 'PRC-006', Referencia: 'REF-PRC-006', EAN: '7891234560006', Nome: 'Porcelanato Mármore Calacatta 90x90', Categoria: 'Porcelanato', Custo: 95.00, 'Preço Base': 199.90, Estoque: 40, Unidade: 'm²' },
  { SKU: 'PRC-007', Referencia: 'REF-PRC-007', EAN: '7891234560007', Nome: 'Porcelanato Rústico Terracota 60x60', Categoria: 'Porcelanato', Custo: 42.00, 'Preço Base': 84.90, Estoque: 130, Unidade: 'm²' },
];

const ws = XLSX.utils.json_to_sheet(data);

// Set column widths
ws['!cols'] = [
  { wch: 10 },  // SKU
  { wch: 14 },  // Referencia
  { wch: 16 },  // EAN
  { wch: 40 },  // Nome
  { wch: 16 },  // Categoria
  { wch: 10 },  // Custo
  { wch: 12 },  // Preço Base
  { wch: 10 },  // Estoque
  { wch: 10 },  // Unidade
];

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Catálogo');

const outPath = join(__dirname, '..', 'templates', 'catalogo-exemplo.xlsx');
const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
writeFileSync(outPath, buffer);

console.log(`Template gerado: ${outPath}`);
console.log(`${data.length} produtos de exemplo`);
