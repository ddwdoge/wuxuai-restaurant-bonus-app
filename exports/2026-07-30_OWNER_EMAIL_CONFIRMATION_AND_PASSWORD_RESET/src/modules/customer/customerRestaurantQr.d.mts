export type CustomerRestaurantQrTarget = {
  restaurantSlug: string;
  targetPath: string;
};

export function restaurantTargetFromQrValue(
  rawValue: unknown,
  allowedOrigins: ReadonlyArray<string>,
): CustomerRestaurantQrTarget | null;
