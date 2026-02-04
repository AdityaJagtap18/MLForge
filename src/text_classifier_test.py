import os
import pandas as pd
import sys
import pickle

from config import Config
import argparse
class TextClassifierTest:
	"""
		This is the test phase of the text classifier model we are implementing
		Arguments:
			:param arg1:test filename
			:param arg2:vectorizer pickle filename
			:param arg3:classifier pickle filename
			:param arg4:input column number
			:param arg5:target column number
			:type arg1:str
			:type arg2:str
			:type arg3:str
			:type arg4:int
			:type arg5:int
			:returns:output file with predicted data
			:rtype:.csv
		
	"""	

	def __init__(self,training_id,testing_id,csv_file_name,pickle_file_name,classifier_picklefile,input_col,target_col):
		self.training_id = ''.join(map(str,training_id))
		self.testing_id = ''.join(map(str,testing_id))
		self.csv_file_name = ''.join(map(str,csv_file_name))
		self.pickle_file_name = ''.join(map(str,pickle_file_name))
		self.classifier_picklefile = ''.join(map(str,classifier_picklefile))
		self.input_col = input_col
		self.target_col = target_col
		self.get_params()


	def get_params(self):
		try:
			df=pd.read_csv(self.csv_file_name)
			inputParams = [df.columns.get_loc(c) for c in self.input_col if c in df]
			targetParams = [df.columns.get_loc(c) for c in self.target_col if c in df]
			df.fillna(0, inplace=True) 
			x_test=df.iloc[:,inputParams].values[:,0]
			self.predict(df,x_test,targetParams)
		except FileNotFoundError as fne:
			print(fne)


	def predict(self,df,x_test,targetParams):
		vectorizer_pickle_file = pickle.load(open(self.pickle_file_name, 'rb'))
		classifier_picklefile = pickle.load(open(self.classifier_picklefile, 'rb'))
		y_pred=classifier_picklefile.predict(vectorizer_pickle_file.transform(x_test))
		colName=df.columns[targetParams]
		df[colName]=y_pred
		self.output(df)


	def output(self,df): 
		filename_w_ext = os.path.basename(self.csv_file_name)
		filename , ext = os.path.splitext(filename_w_ext)
		outputFileName = filename+'_output.csv'

		outputFileName = os.path.join(Config.TEXT_CLASSIFIER_TEST_OUTPUT_FOLDER, outputFileName)
		try:
			df.to_csv(outputFileName,index=False)
			print("Text classifier csv output file generated successfully")
		except Exception as e:
			print("Error: ", e.__str__())
		except IOError as ioe:
			print(ioe)
		except OSError as ose:
			print(ose)
		except FileNotFoundError as fne:
			print(fne)

if __name__ == "__main__":
	parser = argparse.ArgumentParser(description='')
	
	requiredNamed = parser.add_argument_group('required arguments')
	requiredNamed.add_argument('--training_id', type= str, nargs='+',
						help='text classifier training id')
	requiredNamed.add_argument('--testing_id', type= str, nargs='+',
						help='text classifier testing id')
	requiredNamed.add_argument('--csv_file_name', type= str, nargs='+',
						help='csv filename')
	requiredNamed.add_argument('--pickle_file_name',type= str, nargs='+',
						help='pickle file name for text classifier test phase',required=True)
	requiredNamed.add_argument('--classifier_picklefile',type= str, nargs='+',
						help='classifier pickle file for test phase',required=True)
	requiredNamed.add_argument('--input_col',nargs='+',
						help='input columns for text classifier test phase')
	requiredNamed.add_argument('--target_col',nargs='+',
						help='target column for text classifier test phase')

	args = parser.parse_args()
	test = TextClassifierTest(args.training_id,args.testing_id,args.csv_file_name,args.pickle_file_name,args.classifier_picklefile,args.input_col,args.target_col)