import { RouterProvider } from "react-router";
import { Toaster } from "sonner";
import { router } from "./routes";

export default function App() {
  return (
    <div className="size-full">
      <RouterProvider router={router} />
      <Toaster
        position="top-center"
        richColors
        closeButton
        duration={4000}
      />
    </div>
  );
}
