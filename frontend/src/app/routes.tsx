import { createBrowserRouter, Navigate } from "react-router";
import { Root } from "./components/Root";
import { Home } from "./components/Home";
import { Scenario } from "./components/Scenario";
import { TestCase } from "./components/TestCase";
import { ExecutionResult } from "./components/ExecutionResult";
import { ExecutionBatchResult } from "./components/ExecutionBatchResult";
import { History } from "./components/History";
import { RulesMeta } from "./components/RulesMeta";
import { Login } from "./components/Login";
import { RequireAuth } from "./components/RequireAuth";
import { ScenarioRegistry } from "./components/ScenarioRegistry";
import { ManualChat } from "./components/ManualChat";
import { DataPool } from "./components/DataPool";
import { OpenApiImport } from "./components/OpenApiImport";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Root,
    children: [
      { index: true, Component: Home },
      { path: "scenario/:scenarioId", Component: Scenario },
      { path: "test-case/:scenarioId", Component: TestCase },
      { path: "test-case", element: <Navigate to="/scenario-registry" replace /> },
      { path: "execution-result/:executionId", Component: ExecutionResult },
      { path: "execution-batch", Component: ExecutionBatchResult },
      {
        path: "history",
        element: (
          <RequireAuth>
            <History />
          </RequireAuth>
        ),
      },
      {
        path: "saved",
        element: <Navigate to="/rules" replace />,
      },
      {
        path: "test-cases",
        element: <Navigate to="/rules" replace />,
      },
      {
        path: "rules",
        element: (
          <RequireAuth>
            <RulesMeta />
          </RequireAuth>
        ),
      },
      {
        path: "scenario-registry",
        element: (
          <RequireAuth>
            <ScenarioRegistry />
          </RequireAuth>
        ),
      },
      {
        path: "data-pool",
        element: (
          <RequireAuth>
            <DataPool />
          </RequireAuth>
        ),
      },
      {
        path: "openapi",
        element: (
          <RequireAuth>
            <OpenApiImport />
          </RequireAuth>
        ),
      },
      {
        path: "log-ingest",
        element: <Navigate to="/data-pool?tab=ingest" replace />,
      },
      {
        path: "manual",
        element: (
          <RequireAuth>
            <ManualChat />
          </RequireAuth>
        ),
      },
    ],
  },
  { path: "/login", Component: Login },
]);
