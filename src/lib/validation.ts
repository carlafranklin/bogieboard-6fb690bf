import { z } from 'zod';

export const categoryNameSchema = z
  .string()
  .trim()
  .min(1, 'Category name is required.')
  .max(50, 'Category name must be 50 characters or less.')
  .regex(/^[a-zA-Z0-9\s\-&]+$/, 'Only letters, numbers, spaces, hyphens, and & are allowed.');

export const subcategoryNameSchema = z
  .string()
  .trim()
  .min(1, 'Subcategory name is required.')
  .max(50, 'Subcategory name must be 50 characters or less.')
  .regex(/^[a-zA-Z0-9\s\-&]+$/, 'Only letters, numbers, spaces, hyphens, and & are allowed.');

export const profileSchema = z.object({
  first_name: z.string().max(100, 'First name too long.').nullable().optional(),
  last_name: z.string().max(100, 'Last name too long.').nullable().optional(),
  phone: z
    .string()
    .max(20, 'Phone number too long.')
    .regex(/^[\d\s()+\-]*$/, 'Invalid phone number format.')
    .nullable()
    .optional(),
  address: z.string().max(500, 'Address too long.').nullable().optional(),
  date_of_birth: z.string().nullable().optional(),
  gender: z.enum(['male', 'female', 'nonbinary', 'other']).nullable().optional(),
  marital_status: z.string().max(20).nullable().optional(),
});
