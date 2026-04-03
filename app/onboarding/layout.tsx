import ToastProvider from "@/components/shared/ToastProvider";

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ToastProvider>{children}</ToastProvider>;
}
