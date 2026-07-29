export type CustomerRegistrationForm = {
  firstName: string;
  phoneCountryCode: string;
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
export function isValidCustomerPhone(countryCode: unknown, localNumber: unknown): boolean;
export function customerRegistrationCanSubmit(form: CustomerRegistrationForm, legalReady: boolean): boolean;
