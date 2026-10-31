import { startTransition, type FormEvent } from "react";

/**
 * React resets a `<form action>` after every action, which puts selects back to their
 * first-render option even when the action returned an error or a preview. Submitting
 * through a transition instead keeps what the user entered; `action` stays as the no-JS path.
 */
export function keepValues(action: (form: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
    startTransition(() => action(form));
  };
}
