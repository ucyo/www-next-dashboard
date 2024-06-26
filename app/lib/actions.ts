'use server';
import { z } from 'zod';
import { sql } from '@vercel/postgres';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { signIn } from '@/auth';
import { AuthError } from 'next-auth';
import bcrypt from 'bcrypt';

const FormSchema = z.object({
    id: z.string(),
    customerId: z.string({
        invalid_type_error: 'Please select a customer.',
    }),
    amount: z.coerce.number().gt(0, { message: 'Please enter an amount greater than $0.' }).lt(9999999, { message: 'Please enter an amount less than $9,999,999.99' }),
    status: z.enum(['pending', 'paid'], {
        invalid_type_error: 'Please select an invoice status.'
    }),
    date: z.string(),
});

const UserSchema = z.object({
    id: z.string(),
    username: z.string().min(3, { message: 'Username must be at least 3 characters long.' }),
    email: z.string().email({ message: 'Please provide a valid email address.' }),
    password: z.string().min(6, { message: 'Password must be at least 4 characters long.' }),
    repeated_password: z.string().min(6, { message: 'Password must be the same as password.' })
})

export type TempState = {
    errors?: {
        customerId?: string[];
        amount?: string[];
        status?: string[];
    };
    message?: string | null;
};

export type UserTempState = {
    errors?: {
        username?: string[];
        password?: string[];
        email?: string[];
    };
    message?: string | null;
};



const CreateInvoice = FormSchema.omit({ id: true, date: true });
const UpdateInvoice = FormSchema.omit({ id: true, date: true });
const NewUser = UserSchema.omit({ id: true });

export async function createInvoice(prevState: TempState, formData: FormData) {
    //Validate form fields using Zod
    const validatedFields = CreateInvoice.safeParse({
        customerId: formData.get('customerId'),
        amount: formData.get('amount'),
        status: formData.get('status'),
    })
    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: 'Missing Fields. Failed to create Invoice.',
        }
    }
    const { customerId, amount, status } = validatedFields.data;
    const amountInCents = amount * 100;
    const date = new Date().toISOString().split('T')[0];

    // Implicitly parse all data in form
    // const autoFormData = Object.fromEntries(formData.entries())
    // console.log(autoFormData)

    try {
        await sql`
        INSERT INTO invoices (customer_id, amount, status, date)
        VALUES (${customerId}, ${amountInCents}, ${status}, ${date})
        `;
    } catch (error) {
        return {
            message: "Database Error: Failed to create invoice.",
        };
    }
    revalidatePath('/dashboard/invoices');  // remove cached entry on server side for invoices table
    redirect('/dashboard/invoices')
}

export async function updateInvoice(id: string, prevState: TempState, formData: FormData) {
    const validatedFields = UpdateInvoice.safeParse({
        customerId: formData.get('customerId'),
        amount: formData.get('amount'),
        status: formData.get('status'),
    });
    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: 'Missing Fields. Failed to create Invoice.',
        }
    }
    const { customerId, amount, status } = validatedFields.data;
    const amountInCents = amount * 100;
    try {
        await sql`
            UPDATE invoices
            SET customer_id = ${customerId}, amount = ${amountInCents}, status = ${status}
            WHERE id = ${id}
        `;
    } catch (error) {
        return {
            message: "Database Error: Failed to update invoice.",
        };
    }

    revalidatePath('/dashboard/invoices');
    redirect('/dashboard/invoices');
}

export async function deleteInvoice(id: string) {
    try {
        await sql`DELETE FROM invoices WHERE id = ${id}`;
        revalidatePath('/dashboard/invoices');
    } catch (error) {
        return {
            message: "Database Error: Failed to delete invoice.",
        };
    }
}

export async function authenticate(
    prevState: string | undefined,
    formData: FormData,
) {
    try {
        await signIn('credentials', formData);
    } catch (error) {
        if (error instanceof AuthError) {
            switch (error.type) {
                case 'CredentialsSignin':
                    return 'Invalid credentials.';
                default:
                    return 'Something went wrong.';
            }
        }
        throw error;
    }
}


export async function register(prevState: UserTempState, formData: FormData) {
    //Validate form fields using Zod
    const validatedFields = NewUser.safeParse({
        username: formData.get('username'),
        email: formData.get('email'),
        password: formData.get('password'),
        repeated_password: formData.get('repeated_password'),
    })
    if (!validatedFields.success) {
        console.log(validatedFields.error);
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: 'Missing Fields. Failed to create new user.',
        }
    }
    const { username, email, password, repeated_password } = validatedFields.data;
    const hashed_password = await bcrypt.hash(password, 10);
    const matchPassword = await bcrypt.compare(repeated_password, hashed_password);
    if (!matchPassword) {
        return {
            message: 'Passwords do not match!'
        }
    }

    try {
        await sql`
        INSERT INTO users (name, email, password)
        VALUES (${username}, ${email}, ${hashed_password})
        `;
    } catch (error) {
        return {
            message: "Database Error: Failed to create invoice.",
        };
    }
    redirect('/login')
}