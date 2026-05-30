import type React from "react";
import { useReducer } from "react";

export type FormState<T> = {
  values: T;
  errors: Record<string, string>;
};

export type FormAction<T> =
  | { type: "SET_FIELD"; field: keyof T; value: unknown }
  | { type: "CLEAR_ERROR"; field: keyof T }
  | { type: "SET_ERRORS"; errors: Record<string, string> }
  | { type: "RESET"; initialValues: T };

export type FormReducerT<T> = {
  formState: FormState<T>;
  updateFormState: React.Dispatch<FormAction<T>>;
  setField: <K extends keyof T>(field: K, value: T[K]) => void;
  reset: () => void;
};

function formReducer<T>(
  state: FormState<T>,
  action: FormAction<T>,
): FormState<T> {
  switch (action.type) {
    case "SET_FIELD":
      return {
        ...state,
        values: { ...state.values, [action.field]: action.value },
      };
    case "CLEAR_ERROR": {
      const nextErrors = { ...state.errors };
      delete nextErrors[action.field as string];
      return { ...state, errors: nextErrors };
    }
    case "SET_ERRORS":
      return { ...state, errors: action.errors };
    case "RESET":
      return {
        values: action.initialValues,
        errors: {},
      };
    default:
      return state;
  }
}

export const useFormReducer = <T,>(initialValues: T): FormReducerT<T> => {
  const [formState, dispatch] = useReducer(formReducer<T>, {
    values: initialValues,
    errors: {},
  });

  const setField = <K extends keyof T>(field: K, value: T[K]): void => {
    // simultaneously update state, and reset any error associated with that state.
    dispatch({ type: "SET_FIELD", field, value });
    dispatch({ type: "CLEAR_ERROR", field });
  };

  const reset = () => {
    dispatch({ type: "RESET", initialValues });
  };

  return {
    formState,
    updateFormState: dispatch,
    setField,
    reset,
  };
};
