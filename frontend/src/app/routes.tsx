import { createBrowserRouter, Navigate } from "react-router";
import { Root } from "./components/Root";
import { Home } from "./components/Home";
import { Scenario } from "./components/Scenario";
import { TestCase } from "./components/TestCase";
import { ExecutionResult } from "./components/ExecutionResult";
import { History } from "./components/History";
import { RulesMeta } from "./components/RulesMeta";
import { Login } from "./components/Login";
import { RequireAuth } from "./components/RequireAuth";
import { ScenarioRegistry } from "./components/ScenarioRegistry";
import { ManualChat } from "./components/ManualChat";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Root,
    children: [
      { index: true, Component: Home },
      { path: "scenario/:scenarioId", Component: Scenario },
      { path: "test-case/:scenarioId", Component: TestCase },
      { path: "test-case", Component: TestCase },
      { path: "execution-result/:executionId", Component: ExecutionResult },
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
