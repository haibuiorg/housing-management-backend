import PDFDocument from 'pdfkit';
import { Invoice } from '../../dto/invoice';
import { Company } from '../../dto/company';
import { Writable } from 'stream';
import { BankAccount } from '../../dto/bank_account';
import { Address } from '../../dto/address';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const codes = require('rescode');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const axios = require('axios').default;
const fetchImage = async (src: string) => {
  try {
    const response = await axios.get(src, {
      responseType: 'arraybuffer',
    });
    return response.data;
  } catch (error) {
    console.log(error);
    return '';
  }
};

export const generateInvoicePdf = async (
  invoice: Invoice,
  company: Company,
  bankAccount: BankAccount,
  receiverName: string,
  googleCloudStorageUpload: Writable,
  receiverAddress: Address,
) => {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 24,
  });

  await generateHeader(doc, company);
  generateCustomerInformation(doc, invoice, receiverName, receiverAddress);
  generateInvoiceTable(doc, invoice);
  generateFooter(doc, company, bankAccount, invoice);
  doc.end();
  doc.pipe(googleCloudStorageUpload);
};

const generateHeader = async (doc: PDFKit.PDFDocument, company: Company) => {
  const logo = company.logo_url && company.logo_url.length > 0 ? await fetchImage(company.logo_url!) : '';
  if (logo !== '') doc.image(logo, 50, 45, { width: 50, height: 50, fit: [50, 50] });
  doc
    .fillColor('#444444')
    .fontSize(20)
    .text(`${company.name}`, 110, 57)
    .fontSize(10)
    .text(
      // eslint-disable-next-line max-len
      `${company.street_address_1 ?? ''} ${company.street_address_2 ?? ''}, ${company.postal_code ?? ''}, ${
        company.city ?? ''
      }`,
      200,
      65,
      { align: 'right' },
    )
    .text(`${company.country_code}`, 200, 80, { align: 'right' })
    .moveDown();
};

const generateCustomerInformation = (
  doc: PDFKit.PDFDocument,
  invoice: Invoice,
  receiverName: string,
  address: Address,
) => {
  doc.fillColor('#444444').fontSize(20).text('Invoice', 50, 160);

  generateHr(doc, 185);

  const customerInformationTop = 200;

  doc
    .fontSize(10)
    .text('Invoice number:', 50, customerInformationTop)
    .font('Helvetica-Bold')
    .text(invoice.reference_number ?? '', 150, customerInformationTop)
    .font('Helvetica')
    .text('Invoice Date:', 50, customerInformationTop + 15)
    .text(formatDate(new Date()), 150, customerInformationTop + 15)
    .text('Balance Due:', 50, customerInformationTop + 30)
    .text(formatCurrency(invoice.currency_code, invoice.subtotal - invoice.paid), 150, customerInformationTop + 30)

    .font('Helvetica-Bold')
    .text(receiverName ?? 'Receiver', 300, customerInformationTop)
    .font('Helvetica')
    .text(
      (address?.street_address_1 ?? '') + ', ' + (address?.street_address_2 ?? ''),
      300,
      customerInformationTop + 15,
    )
    .text(
      (address.city ?? '') + ', ' + (address.postal_code ?? '') + ', ' + (address.country_code ?? ''),
      300,
      customerInformationTop + 30,
    )
    .moveDown();

  generateHr(doc, 252);
};

const generateInvoiceTable = (doc: PDFKit.PDFDocument, invoice: Invoice) => {
  let i;
  const invoiceTableTop = 330;

  doc.font('Helvetica-Bold');
  generateTableRow(doc, invoiceTableTop, 'Name', 'Description', 'Price', 'Qty', 'Incld. Tax (%)', 'Line Total');
  generateHr(doc, invoiceTableTop + 20);
  doc.font('Helvetica');

  for (i = 0; i < invoice.items.length; i++) {
    const item = invoice.items[i];
    const position = invoiceTableTop + (i + 1) * 30;
    generateTableRow(
      doc,
      position,
      item.payment_product_item.name,
      item.payment_product_item.description,
      formatCurrency(
        invoice.currency_code,
        item.payment_product_item.amount / (1 + item.payment_product_item.tax_percentage / 100),
      ),
      item.quantity.toFixed(3),
      (item.payment_product_item.tax_percentage ?? 0).toFixed(2),
      formatCurrency(invoice.currency_code, item.payment_product_item.amount),
    );

    generateHr(doc, position + 20);
  }

  const subtotalPosition = invoiceTableTop + (i + 1) * 30;
  generateTableRow(
    doc,
    subtotalPosition,
    '',
    '',
    'Subtotal',
    '',
    '',
    formatCurrency(invoice.currency_code, invoice.subtotal),
  );

  const paidToDatePosition = subtotalPosition + 20;
  generateTableRow(
    doc,
    paidToDatePosition,
    '',
    '',
    'Paid To Date',
    '',
    '',
    formatCurrency(invoice.currency_code, invoice.paid),
  );

  const duePosition = paidToDatePosition + 25;
  doc.font('Helvetica-Bold');
  generateTableRow(
    doc,
    duePosition,
    '',
    '',
    'Balance Due',
    '',
    '',
    formatCurrency(invoice.currency_code, invoice.subtotal - invoice.paid),
  );
  doc.font('Helvetica');
};

const generateFooter = (doc: PDFKit.PDFDocument, company: Company, bankAccount: BankAccount, invoice: Invoice) => {
  doc
    .fontSize(10)
    .text(`Payment is due on: ${new Date(invoice.payment_date)}`, 50, 600, {
      align: 'center',
    })
    .text(`Account name: ${company.name}`, 50, 620, {
      align: 'center',
    })
    .text(`IBAN: ${bankAccount.bank_account_number}`, 50, 640, {
      align: 'center',
    })
    .text(`SWIFT/BIC: ${bankAccount.swift}`, 50, 660, { align: 'center' })
    .text(`Reference number: ${invoice.reference_number ?? ''}`, 50, 680, {
      align: 'center',
    })
    .text(`Virtual barcode: ${invoice.virtual_barcode ?? 'Not available'}`, 50, 700, { align: 'center' })
    .text('Invoice created with Priorli', 50, 720, {
      align: 'center',
      link: 'www.priorli.com',
      underline: true,
    })
    .moveDown();
  codes.loadModules(['code128'], { includetext: false });
  const logo = codes.create('code128', invoice.virtual_barcode);
  if (logo) {
    doc.image(logo, 50, 770, {
      align: 'center',
      width: doc.page.width - 100,
      height: 64,
    });
  }
};

const generateTableRow = (
  doc: PDFKit.PDFDocument,
  y: number,
  item: string,
  description: string,
  unitCost: string,
  quantity: string,
  taxPercentage: string,
  lineTotal: string,
) => {
  doc
    .fontSize(10)
    .text(item, 50, y)
    .text(description.substring(0, 20), 150, y)
    .text(unitCost, 250, y, { width: 90, align: 'right' })
    .text(quantity, 290, y, { width: 90, align: 'right' })
    .text(taxPercentage, 380, y, { width: 90, align: 'right' })
    .text(lineTotal, 50, y, { align: 'right' });
};

const generateHr = (doc: PDFKit.PDFDocument, y: number) => {
  doc.strokeColor('#aaaaaa').lineWidth(1).moveTo(50, y).lineTo(550, y).stroke();
};

const formatCurrency = (currencyCode: string, val: number) => {
  return '€' + val.toFixed(2);
};

const formatDate = (date: Date) => {
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();

  return day + '.' + month + '.' + year;
};
