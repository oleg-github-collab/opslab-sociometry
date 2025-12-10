package seed

import (
	"fmt"
	"opslab-survey/internal/models"
)

// Participants returns the fixed list of allowed people (Anastasiia excluded).
func Participants() []models.Participant {
	return []models.Participant{
		{Code: "1122", Name: "Катерина Петухова", Email: "kateryna.petukhova@opslab.uk"},
		{Code: "1425", Name: "Марія Василик", Email: "mariya.vasylyk@opslab.uk"},
		{Code: "3814", Name: "Ірина Мячкова", Email: "iryna.miachkova@opslab.uk"},
		{Code: "4582", Name: "Вероніка Кухарчук", Email: "veronika.kukharchuk@opslab.uk"},
		{Code: "6738", Name: "Іванна Сакало", Email: "ivanna.sakalo@opslab.uk"},
		{Code: "7139", Name: "Jane Давидюк", Email: "janedavydiuk@opslab.uk"},
		{Code: "8463", Name: "Оксана Клінчаян", Email: "oksana.klinchaian@opslab.uk"},
		{Code: "9267", Name: "Михайло Іващук", Email: "mykhailo.ivashchuk@opslab.uk"},
		{Code: "0000", Name: "Олег Камінський (Адмін/тест)", Email: "work.olegkaminskyi@gmail.com", IsAdmin: true},
	}
}

// CommonQuestions supplies shared prompts about team dynamics.
func CommonQuestions() []models.Question {
	return []models.Question{
		{
			ID:          "common:ownership-gaps",
			Title:       "Зони розмитої відповідальності",
			Description: "Опишіть 1-2 конкретні ситуації або процеси, де неясно хто несе відповідальність. Що б допомогло зробити межі чіткішими?",
			Type:        "text",
			Scope:       "common",
		},
		{
			ID:          "common:decision-barriers",
			Title:       "Що уповільнює прийняття рішень у команді?",
			Description: "Назвіть конкретні бар'єри, патерни або звички, які гальмують швидкість прийняття рішень. Що можна змінити?",
			Type:        "text",
			Scope:       "common",
		},
		{
			ID:          "common:team-strength",
			Title:       "Найсильніша сторона нашої команди",
			Description: "Що ми робимо краще за інших? В чому наша унікальна перевага як команди?",
			Type:        "text",
			Scope:       "common",
		},
		{
			ID:          "common:improvement-priority",
			Title:       "Що покращити в першу чергу?",
			Description: "Якби можна було змінити тільки одну річ у роботі команди в найближчі 3 місяці — що це було б?",
			Type:        "text",
			Scope:       "common",
		},
		{
			ID:          "common:communication-quality",
			Title:       "Якість комунікації в команді",
			Description: "Оцініть, наскільки відкрито та ефективно ми спілкуємось. 1 — багато недомовленостей, 10 — повна прозорість.",
			Type:        "scale",
			ScaleMax:    10,
			Scope:       "common",
		},
		{
			ID:          "common:trust-level",
			Title:       "Рівень довіри між членами команди",
			Description: "Наскільки ви відчуваєте довіру до колег? 1 — низька довіра, 10 — повна довіра.",
			Type:        "scale",
			ScaleMax:    10,
			Scope:       "common",
		},
		{
			ID:          "common:collaboration-improvement",
			Title:       "Що підвищить якість співпраці?",
			Description: "Опишіть конкретний ритуал, правило або зміну, яка покращить взаємодію в команді.",
			Type:        "text",
			Scope:       "common",
		},
		{
			ID:          "common:personal-contribution",
			Title:       "Ваш особистий внесок у команду",
			Description: "В чому саме ви приносите найбільшу цінність команді? Що є вашою сильною стороною?",
			Type:        "text",
			Scope:       "common",
		},
	}
}

// PeerQuestionTemplates are varied phrasings around одна тема для різних людей.
type PeerQuestionTemplate struct {
	ID            string
	TitleFmt      string
	DescriptionFmt string
	Type          string
	ScaleMax      int
	Choice        []string
}

func PeerTemplates() []PeerQuestionTemplate {
	return []PeerQuestionTemplate{
		{
			ID:            "peer:collaboration-quality",
			TitleFmt:      "Якість співпраці з %s",
			DescriptionFmt: "Оцініть, наскільки легко та продуктивно вам працюється з %s. 1 — складно, 10 — ідеально.",
			Type:          "scale",
			ScaleMax:      10,
		},
		{
			ID:            "peer:reliability",
			TitleFmt:      "Надійність %s у виконанні обіцянок",
			DescriptionFmt: "Наскільки %s виконує те, що обіцяє? 1 — рідко, 10 — завжди.",
			Type:          "scale",
			ScaleMax:      10,
		},
		{
			ID:            "peer:strengths",
			TitleFmt:      "Найсильніша сторона %s",
			DescriptionFmt: "В чому %s особливо сильний/сильна? Яка головна цінність цієї людини для команди?",
			Type:          "text",
		},
		{
			ID:            "peer:growth-area",
			TitleFmt:      "Зона розвитку для %s",
			DescriptionFmt: "Що б ви порадили %s покращити або розвинути? Будьте конструктивні та конкретні.",
			Type:          "text",
		},
		{
			ID:            "peer:trust-level",
			TitleFmt:      "Рівень довіри до %s",
			DescriptionFmt: "Наскільки ви довіряєте %s у професійному контексті? 1 — низька довіра, 10 — повна довіра.",
			Type:          "scale",
			ScaleMax:      10,
		},
		{
			ID:            "peer:communication",
			TitleFmt:      "Як %s комунікує в команді?",
			DescriptionFmt: "Опишіть стиль комунікації %s. Що працює добре, що можна покращити?",
			Type:          "text",
		},
	}
}

// BuildPeerQuestions returns expanded questions for concrete colleagues.
func BuildPeerQuestions(peers []models.Participant) []models.Question {
	var out []models.Question
	for _, peer := range peers {
		for idx, t := range PeerTemplates() {
			id := fmt.Sprintf("%s:%s:%d", t.ID, peer.Code, idx)
			out = append(out, models.Question{
				ID:          id,
				Title:       fmt.Sprintf(t.TitleFmt, peer.Name),
				Description: fmt.Sprintf(t.DescriptionFmt, peer.Name),
				Type:        t.Type,
				ScaleMax:    t.ScaleMax,
				Choice:      t.Choice,
				Scope:       "peer",
				PeerCode:    peer.Code,
			})
		}
	}
	return out
}
