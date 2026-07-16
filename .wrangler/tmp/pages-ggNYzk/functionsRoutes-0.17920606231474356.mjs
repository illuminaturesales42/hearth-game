import { onRequestGet as __v1_save_ts_onRequestGet } from "F:\\Mastermind launch\\hearth\\functions\\v1\\save.ts"
import { onRequestPut as __v1_save_ts_onRequestPut } from "F:\\Mastermind launch\\hearth\\functions\\v1\\save.ts"

export const routes = [
    {
      routePath: "/v1/save",
      mountPath: "/v1",
      method: "GET",
      middlewares: [],
      modules: [__v1_save_ts_onRequestGet],
    },
  {
      routePath: "/v1/save",
      mountPath: "/v1",
      method: "PUT",
      middlewares: [],
      modules: [__v1_save_ts_onRequestPut],
    },
  ]