export type BillingType = "MONTHLY" | "WEEKLY" | "MEAL_BASED";
export type MealType = "BREAKFAST" | "LUNCH" | "SNACKS" | "DINNER";
export type EnrollmentStatus = "ACTIVE" | "PAUSED" | "CANCELLED" | "EXPIRED";
export type OrderStatus = "PENDING" | "CONFIRMED" | "READY" | "COMPLETED" | "CANCELLED";
export type ItemCategory = "BEVERAGE" | "SNACK" | "MEAL" | "DESSERT" | "OTHER";

export interface MessPlan {
  id: string;
  name: string;
  description: string;
  billingType: BillingType;
  price: number;
  mealsPerDay: number;
  active: boolean;
}

export interface MessEnrollment {
  id: string;
  studentId: string;
  studentNo?: string;
  studentName?: string;
  planId: string;
  planName?: string;
  billingType?: BillingType;
  price?: number;
  startDate: string;
  endDate: string | null;
  status: EnrollmentStatus;
  autoRenew: boolean;
}

export interface MenuEntry {
  id: string;
  mealDate: string;
  mealType: MealType;
  menuDescription: string;
  calories: number | null;
  active: boolean;
}

export interface MealAttendanceRecord {
  id: string;
  studentId: string;
  studentNo?: string;
  studentName?: string;
  mealDate: string;
  mealType: MealType;
  consumed: boolean;
  recordedBy?: string | null;
}

export interface CanteenItem {
  id: string;
  name: string;
  category: ItemCategory;
  description: string;
  price: number;
  available: boolean;
}

export interface CanteenOrder {
  id: string;
  studentId: string;
  studentNo?: string;
  studentName?: string;
  status: OrderStatus;
  totalAmount: number;
  orderedAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
  items: Array<{
    itemId: string;
    itemName: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }>;
}

export interface FoodFeeRecord {
  id: string;
  feeType: string;
  amount: number;
  amountPaid: number;
  balance: number;
  dueDate: string;
  status: string;
}

export interface MessFeedback {
  id: string;
  studentId: string;
  mealDate: string;
  mealType: MealType;
  rating: number;
  comment: string;
  createdAt: string;
}
