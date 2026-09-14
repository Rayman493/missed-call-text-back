import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
  Font,
} from '@react-pdf/renderer'
import {
  DocumentPresentation,
  formatDate,
  formatMoney,
  formatQuantity,
} from '@/lib/billing/document-presentation'

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 11,
    fontFamily: 'Helvetica',
    color: '#334155',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 30,
  },
  businessInfo: {
    flex: 1,
  },
  logo: {
    width: 120,
    height: 60,
    objectFit: 'contain',
    marginBottom: 10,
  },
  businessName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 2,
  },
  businessDetail: {
    fontSize: 10,
    color: '#64748b',
    marginBottom: 1,
  },
  docType: {
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'right',
  },
  docNumber: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#475569',
    textAlign: 'right',
    marginTop: 4,
  },
  statusBadge: {
    fontSize: 9,
    textAlign: 'center',
    marginTop: 8,
    padding: '3 10',
    borderRadius: 10,
    alignSelf: 'flex-end',
  },
  customerDates: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 25,
  },
  sectionLabel: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#94a3b8',
    textTransform: 'uppercase',
    marginBottom: 3,
    letterSpacing: 0.5,
  },
  customerName: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 1,
  },
  customerDetail: {
    fontSize: 10,
    color: '#64748b',
    marginBottom: 1,
  },
  dateValue: {
    fontSize: 10,
    color: '#334155',
  },
  table: {
    marginBottom: 20,
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 2,
    borderBottomColor: '#e2e8f0',
    paddingBottom: 6,
    marginBottom: 6,
  },
  th: {
    fontWeight: 'bold',
    color: '#475569',
    fontSize: 10,
  },
  thDesc: { flex: 3, textAlign: 'left' },
  thQty: { width: 50, textAlign: 'right' },
  thUnit: { width: 50, textAlign: 'left' },
  thRate: { width: 70, textAlign: 'right' },
  thAmount: { width: 80, textAlign: 'right' },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingVertical: 5,
  },
  tdDesc: { flex: 3, textAlign: 'left', color: '#334155' },
  tdQty: { width: 50, textAlign: 'right', color: '#334155' },
  tdUnit: { width: 50, textAlign: 'left', color: '#64748b' },
  tdRate: { width: 70, textAlign: 'right', color: '#334155' },
  tdAmount: { width: 80, textAlign: 'right', color: '#334155', fontWeight: 'bold' },
  totals: {
    alignSelf: 'flex-end',
    width: 200,
    marginBottom: 25,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  totalLabel: { color: '#64748b', fontSize: 10 },
  totalValue: { color: '#0f172a', fontSize: 10, fontWeight: 'bold' },
  grandTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 6,
    marginTop: 4,
  },
  grandTotalLabel: { fontSize: 13, fontWeight: 'bold', color: '#0f172a' },
  grandTotalValue: { fontSize: 13, fontWeight: 'bold' },
  notesSection: {
    marginBottom: 15,
  },
  notesContent: {
    fontSize: 10,
    color: '#64748b',
    lineHeight: 1.4,
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: 'center',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 8,
    fontSize: 8,
    color: '#cbd5e1',
  },
})

const QUOTE_COLOR = '#1d4ed8'
const INVOICE_COLOR = '#059669'

export function BillingDocumentPdf({ doc }: { doc: DocumentPresentation }) {
  const isQuote = doc.document_type === 'quote'
  const accent = isQuote ? QUOTE_COLOR : INVOICE_COLOR

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {/* Business header */}
        <View style={styles.header}>
          <View style={styles.businessInfo}>
            {doc.business_logo_url ? (
              <Image style={styles.logo} src={doc.business_logo_url} />
            ) : null}
            <Text style={styles.businessName}>{doc.business_name}</Text>
            {doc.business_phone ? <Text style={styles.businessDetail}>{doc.business_phone}</Text> : null}
            {doc.business_email ? <Text style={styles.businessDetail}>{doc.business_email}</Text> : null}
            {doc.business_address ? <Text style={styles.businessDetail}>{doc.business_address}</Text> : null}
          </View>
          <View>
            <Text style={[styles.docType, { color: accent }]}>
              {isQuote ? 'QUOTE' : 'INVOICE'}
            </Text>
            <Text style={styles.docNumber}>{doc.document_number}</Text>
          </View>
        </View>

        {/* Customer + dates */}
        <View style={styles.customerDates}>
          <View>
            <Text style={styles.sectionLabel}>{isQuote ? 'Quote To' : 'Bill To'}</Text>
            <Text style={styles.customerName}>{doc.customer_name || 'No customer specified'}</Text>
            {doc.customer_phone ? <Text style={styles.customerDetail}>{doc.customer_phone}</Text> : null}
            {doc.customer_email ? <Text style={styles.customerDetail}>{doc.customer_email}</Text> : null}
            {doc.customer_address ? <Text style={styles.customerDetail}>{doc.customer_address}</Text> : null}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.sectionLabel}>Issue Date</Text>
            <Text style={styles.dateValue}>{formatDate(doc.issue_date)}</Text>
            {isQuote && doc.valid_until ? (
              <>
                <Text style={[styles.sectionLabel, { marginTop: 6 }]}>Valid Until</Text>
                <Text style={styles.dateValue}>{formatDate(doc.valid_until)}</Text>
              </>
            ) : null}
            {!isQuote && doc.due_date ? (
              <>
                <Text style={[styles.sectionLabel, { marginTop: 6 }]}>Due Date</Text>
                <Text style={styles.dateValue}>{formatDate(doc.due_date)}</Text>
              </>
            ) : null}
          </View>
        </View>

        {/* Line items */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.th, styles.thDesc]}>Description</Text>
            <Text style={[styles.th, styles.thQty]}>Qty</Text>
            <Text style={[styles.th, styles.thUnit]}>Unit</Text>
            <Text style={[styles.th, styles.thRate]}>Rate</Text>
            <Text style={[styles.th, styles.thAmount]}>Amount</Text>
          </View>
          {doc.line_items.map((item, i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={[styles.tdDesc]}>{item.description || ''}</Text>
              <Text style={[styles.tdQty]}>{formatQuantity(item.quantity)}</Text>
              <Text style={[styles.tdUnit]}>{item.unit_label || ''}</Text>
              <Text style={[styles.tdRate]}>{formatMoney(item.unit_price_cents)}</Text>
              <Text style={[styles.tdAmount]}>{formatMoney(item.line_total_cents)}</Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>{formatMoney(doc.subtotal_cents)}</Text>
          </View>
          {doc.discount_cents > 0 ? (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Discount</Text>
              <Text style={[styles.totalValue, { color: '#dc2626' }]}>-{formatMoney(doc.discount_cents)}</Text>
            </View>
          ) : null}
          {doc.tax_cents > 0 ? (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Tax</Text>
              <Text style={styles.totalValue}>{formatMoney(doc.tax_cents)}</Text>
            </View>
          ) : null}
          <View style={styles.grandTotal}>
            <Text style={styles.grandTotalLabel}>Total</Text>
            <Text style={[styles.grandTotalValue, { color: accent }]}>{formatMoney(doc.total_cents)}</Text>
          </View>
        </View>

        {/* Notes */}
        {doc.notes ? (
          <View style={styles.notesSection}>
            <Text style={styles.sectionLabel}>Notes</Text>
            <Text style={styles.notesContent}>{doc.notes}</Text>
          </View>
        ) : null}

        {/* Terms */}
        {doc.terms ? (
          <View style={styles.notesSection}>
            <Text style={styles.sectionLabel}>Terms</Text>
            <Text style={styles.notesContent}>{doc.terms}</Text>
          </View>
        ) : null}

        {/* Footer */}
        <View style={styles.footer}>
          <Text>Powered by ReplyFlow</Text>
        </View>
      </Page>
    </Document>
  )
}
