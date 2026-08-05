import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { RouterProvider } from "react-router";
import { Toaster } from "sonner";
import { router } from "./routes";

export default function App() {
  return (
    <div className="size-full">
      {/* HTML5Backend is global: only one provider may exist for the whole app. */}
      <DndProvider backend={HTML5Backend}>
        <RouterProvider router={router} />
      </DndProvider>
      <Toaster
        position="top-center"
        richColors
        closeButton
        duration={4000}
      />
    </div>
  );
}
