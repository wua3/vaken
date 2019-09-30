import React, { useContext, FunctionComponent, useState, useEffect, useCallback, FC } from 'react';
import styled from 'styled-components';
import { useImmer } from 'use-immer';
import { Spinner } from '../../components/Loading/Spinner';
import config from '../../assets/application';
import { Collapsible } from '../../components/Containers/Collapsible';
import FloatingPopup from '../../components/Containers/FloatingPopup';
import { ActionButtonContext } from '../../contexts/ActionButtonContext';
import { HeaderButton } from '../../components/Buttons/HeaderButton';
import { InputProps } from '../../components/Input/TextInput';
import { useUpdateMyApplicationMutation, useMyApplicationQuery } from '../../generated/graphql';
import { GraphQLErrorMessage } from '../../components/Text/ErrorMessage';

export interface ConfigSection {
	category: string;
	fields: ConfigField[];
	title: string;
}

export interface ConfigField {
	Component: FC<InputProps>;
	default?: string;
	fieldName: string;
	note?: string;
	optional?: boolean;
	options?: string[];
	other?: boolean;
	placeholder?: string;
	prompt?: string;
	required?: boolean;
	title: string;
	validation?: string;
}

export const StyledForm = styled.form`
	display: flex;
	max-width: 100%;
	flex-direction: column;
	max-width: 100%;

	fieldset {
		margin-top: 0.4rem;
	}

	& > div:not(:first-of-type) {
		margin-top: 1.4rem;
	}
`;

export const StyledQuestion = styled.label`
	display: flex;
	flex-flow: column nowrap;
	font-size: 1rem;

	& > input {
		border-radius: 6px;
		background: white;
	}
`;

export const StyledQuestionPadContainer = styled.div`
	margin-bottom: 0.4rem;
`;

export const FieldPrompt = styled.h3`
	font-weight: lighter;
	font-size: 1em;
`;

export const FieldNote = styled.span`
	font-style: italic;
	font-weight: lighter;
	font-size: 1em;
`;

export const FieldTitle = styled.span`
	display: inline-block;
	font-style: normal;
	font-size: 1em;
	line-height: 140%;
`;

const disableEnter = (e: React.KeyboardEvent<HTMLFormElement>): void => {
	if (e.key === 'Enter') e.preventDefault();
};

let autosaveTimeout: NodeJS.Timeout;

export const Application: FunctionComponent<{}> = (): JSX.Element => {
	const { update: setActionButton } = useContext(ActionButtonContext);
	const [openSection, setOpenSection] = useState('');
	const [input, setInput] = useImmer<{ answer: string; question: string }[]>([]);
	const [loaded, setLoaded] = useState(false);
	const [updateApplication] = useUpdateMyApplicationMutation();
	const { data, error, loading } = useMyApplicationQuery();

	// Only update changed QuestionIDs
	const createOnChangeHandler = (fieldName: string): ((value: string) => void) => value => {
		void setInput(draft => {
			const element = draft.find(el => el.question === fieldName);
			if (!element) {
				draft.push({ answer: value, question: fieldName });
			} else {
				element.answer = value;
			}
		});
	};

	const valueHandler = (fieldName: string): string => {
		const element = input.find(el => el.question === fieldName);
		return element ? element.answer : '';
	};

	useEffect((): (() => void) => {
		if (setActionButton)
			setActionButton(
				<HeaderButton
					// tabIndex={1}
					width="8em"
					onClick={async () => updateApplication({ variables: { input } })}>
					<p>Submit</p>
				</HeaderButton>
			);

		return () => {
			if (setActionButton) setActionButton(undefined);
		};
	}, [input, setActionButton, updateApplication]);

	useEffect((): void => {
		if (!loaded && data && data.me) {
			const { application } = data.me;
			setInput(draft => {
				draft.length = 0; // Clear the array

				// Omit the `__typename` field.
				application.forEach(({ question, answer }) =>
					draft.push({ answer: answer || '', question })
				);
			});
			setOpenSection(config[0].title);
			setLoaded(true);
		}
	}, [data, loaded, setLoaded, setInput]);

	useEffect(() => {
		// Auto-save application input after five seconds of inactivity.
		autosaveTimeout = setTimeout(() => updateApplication({ variables: { input } }), 5000);

		// Cleanup
		return () => clearTimeout(autosaveTimeout);
	}, [input, updateApplication]);

	const toggleOpen = useCallback(
		(e: React.MouseEvent<HTMLButtonElement>): void => {
			const { id } = e.currentTarget;
			setOpenSection(openSection === id ? '' : id);
			e.preventDefault();
		},
		[openSection]
	);

	// if error getting application input
	if (error) {
		console.log(error);
		return <GraphQLErrorMessage text={JSON.stringify(error)} />;
	}

	if (loading) return <Spinner />;

	return (
		<FloatingPopup
			borderRadius="1rem"
			// height="100%"
			width="100%"
			backgroundOpacity="1"
			justifyContent="flex-start"
			alignItems="flex-start"
			padding="1.5rem">
			<StyledForm onKeyPress={disableEnter}>
				{config.map(({ fields, title }: ConfigSection) => (
					<Collapsible onClick={toggleOpen} open={openSection === title} title={title} key={title}>
						{fields.map(field => (
							<StyledQuestion key={field.title} htmlFor={field.title}>
								<StyledQuestionPadContainer>
									{field.title}
									{field.note ? <FieldNote>{` - ${field.note}`}</FieldNote> : null}
								</StyledQuestionPadContainer>
								{field.prompt ? <FieldPrompt>{field.prompt}</FieldPrompt> : null}
								<field.Component
									setState={createOnChangeHandler(field.fieldName)}
									value={valueHandler(field.fieldName)}
									{...field}
									id={field.title}
								/>
							</StyledQuestion>
						))}
					</Collapsible>
				))}
			</StyledForm>
		</FloatingPopup>
	);
};

export default Application;
