// The two error shapes the API sends, plus the fallback.
import { errorMessage } from "./api";

const err = (data) => ({ response: { data } });

test("business errors carry { detail }", () => {
  expect(errorMessage(err({ detail: "Questo slot è già prenotato" }))).toBe("Questo slot è già prenotato");
});

test("ASP.NET validation problems carry { errors: { Field: [msg] } }", () => {
  expect(errorMessage(err({ title: "One or more validation errors occurred.",
    errors: { Email: ["The Email field is not a valid e-mail address."] } })))
    .toBe("The Email field is not a valid e-mail address.");
});

test("no body (network error, bare 401/500) falls back", () => {
  expect(errorMessage({}, "Errore di rete")).toBe("Errore di rete");
  expect(errorMessage(err(""), "Errore")).toBe("Errore");
});
