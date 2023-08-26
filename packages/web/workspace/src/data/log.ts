import { bus } from "$/providers/bus";
import { LogEvent } from "@console/core/log";
import { batch } from "solid-js";
import { createStore, produce, reconcile } from "solid-js/store";

export const [LogStore, setLogStore] = createStore<
  Record<string, Invocation[]>
>({});

export function clearLogStore(input: string) {
  invocations.delete(input);
  invocations.delete(input);
  setLogStore(
    produce((state) => {
      state[input] = [];
    })
  );
}

export interface Invocation {
  id: string;
  cold: boolean;
  event?: any;
  response?: any;
  error?: {
    type: string;
    message: string;
    trace: string[];
  };
  report?: {
    duration: number;
    size: number;
    memory: number;
    xray: string;
  };
  start: Date;
  end?: Date;
  logs: Log[];
}

interface Log {
  id?: string;
  timestamp: Date;
  message: string;
}

// stash log entries that come out of order before log start
const pendingEntries = new Map<string, Log[]>();
const invocations = new Map<string, Map<string, Invocation>>();

bus.on("log.url", async (e) => {
  const data: LogEvent[] = await fetch(e).then((r) => r.json());
  console.time("log");
  console.log("processing", data.length);
  bus.emit("log", data);
  console.timeEnd("log");
});

bus.on("log", (data) => {
  const track = new Map<string, number>();
  setLogStore(
    produce((state) => {
      for (const event of data) {
        performance.mark("start");
        switch (event.type) {
          case "start": {
            if (invocations.get(event.group)?.has(event.requestID)) break;
            let group = state[event.group];
            if (!group) state[event.group] = group = [];
            const pending = pendingEntries.get(event.requestID) || [];
            pendingEntries.delete(event.requestID);
            const invocation: Invocation = {
              id: event.requestID,
              start: new Date(event.timestamp),
              cold: event.cold,
              logs: pending,
            };
            group.push(invocation);
            let all = invocations.get(event.group);
            if (!all) invocations.set(event.group, (all = new Map()));
            all.set(event.requestID, invocation);

            // let set = invocations.get(event.group);
            // if (!set) invocations.set(event.group, (set = new Set()));
            // set.add(event.requestID);
            break;
          }
          case "message": {
            const log: Log = {
              id: event.id,
              timestamp: new Date(event.timestamp),
              message: event.message,
            };
            const invocation = invocations
              .get(event.group)
              ?.get(event.requestID);
            let logs = invocation?.logs;
            if (!logs) {
              logs = pendingEntries.get(event.requestID);
              if (!logs) pendingEntries.set(event.requestID, (logs = []));
            }
            if (logs.find((l) => l.id === log.id)) break;
            logs.push(log);
            logs.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
            break;
          }
          case "end": {
            const invocation = invocations
              .get(event.group)
              ?.get(event.requestID);
            if (!invocation) break;
            invocation.end = new Date(event.timestamp);
            break;
          }
          case "report": {
            const invocation = invocations
              .get(event.group)
              ?.get(event.requestID);
            if (!invocation) break;
            invocation.report = {
              duration: event.duration,
              size: event.size,
              memory: event.memory,
              xray: event.xray,
            };
            break;
          }
          case "error": {
            const invocation = invocations
              .get(event.group)
              ?.get(event.requestID);
            if (!invocation) break;
            invocation.error = {
              type: event.error,
              message: event.message,
              trace: event.trace,
            };
          }
        }
        performance.mark("end");
        const result = performance.measure(event.type, "start", "end");
        const avg = result.duration + (track.get(event.type) || 0);
        track.set(event.type, avg / 2);
      }
    })
  );
  console.log(track);
});

bus.on("function.invoked", (e) => {
  bus.emit("log", [
    {
      type: "start",
      timestamp: Date.now(),
      group: e.functionID,
      requestID: e.requestID,
      cold: false,
    },
  ]);
  setLogStore(
    produce((state) => {
      let group = state[e.functionID];
      if (!group) return;
      const invocation = group.find((i) => i.id === e.requestID);
      if (!invocation) return;
      invocation.event = e.event;
    })
  );
});

bus.on("worker.stdout", (e) => {
  bus.emit("log", [
    {
      type: "message",
      timestamp: Date.now(),
      group: e.functionID,
      requestID: e.requestID,
      message: e.message,
      level: "INFO",
      id: Math.random().toString(),
    },
  ]);
});

bus.on("function.success", (e) => {
  bus.emit("log", [
    {
      type: "end",
      timestamp: Date.now(),
      group: e.functionID,
      requestID: e.requestID,
    },
  ]);
  setLogStore(
    produce((state) => {
      let group = state[e.functionID];
      if (!group) return;
      const invocation = group.find((i) => i.id === e.requestID);
      if (!invocation) return;
      invocation.response = e.body;
    })
  );
});

bus.on("function.error", (e) => {
  bus.emit("log", [
    {
      type: "end",
      timestamp: Date.now(),
      group: e.functionID,
      requestID: e.requestID,
    },
  ]);
  setLogStore(
    produce((state) => {
      let group = state[e.functionID];
      if (!group) return;
      const invocation = group.find((i) => i.id === e.requestID);
      if (!invocation) return;
      invocation.error = {
        type: e.errorType,
        message: e.errorMessage,
        trace: e.trace,
      };
    })
  );
});
