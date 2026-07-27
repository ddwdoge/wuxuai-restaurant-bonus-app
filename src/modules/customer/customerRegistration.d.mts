export type CustomerRegistrationForm = {
  firstName: string;
  phone: string;
  birthday: string;
  termsAccepted: boolean;
  privacyAcknowledged: boolean;
  marketingPush: boolean;
  marketingSms: boolean;
  marketingEmail: boolean;
  birthdayProcessing: boolean;
};

export const emptyCustomerRegistrationForm: Readonly<CustomerRegistrationForm>;
export function isValidCustomerFirstName(value: unknown): boolean;
export function isValidCustomerPhone(value: unknown): boolean;
export function customerRegistrationCanSubmit(form: CustomerRegistrationForm, legalReady: boolean): boolean;
