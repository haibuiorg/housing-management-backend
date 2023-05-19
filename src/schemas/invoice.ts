import Joi from 'joi';

const createInvoiceSchema = Joi.object({
  company_id: Joi.string(),
  receiver_ids: Joi.array(),
  items: Joi.array(),
  paid: Joi.number().optional(),
});

module.exports = { createInvoiceSchema };
